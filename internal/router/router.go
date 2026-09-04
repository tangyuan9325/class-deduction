package router

import (
	"os"
	"path/filepath"

	"class-deduction/config"
	"class-deduction/internal/handler"
	"class-deduction/internal/middleware"
	"class-deduction/internal/model"
	"class-deduction/internal/realtime"
	"class-deduction/internal/repo"
	"class-deduction/internal/service"
	"class-deduction/pkg/jwt"
	"github.com/gin-gonic/gin"
)

// Deps 路由层依赖（由 main 组装后注入）
type Deps struct {
	Cfg    *config.Config
	JWTMgr *jwt.Manager
}

// Register 注册全部路由
func Register(r *gin.Engine, deps Deps) {
	// 通用中间件
	r.Use(middleware.CORS())
	r.Use(middleware.Logger())
	r.Use(gin.Recovery())

	// 组装各层依赖
	authSvc := service.NewAuthService(model.DB, deps.JWTMgr, deps.Cfg.JWT.RememberHours)
	authH := handler.NewAuthHandler(authSvc)
	recordRepo := repo.NewRecordRepo(model.DB)
	recordSvc := service.NewRecordService(recordRepo, model.DB)
	permSvc := service.NewPermissionService(model.DB)
	recordH := handler.NewRecordHandler(recordSvc, permSvc)
	userRepo := repo.NewUserRepo(model.DB)
	userSvc := service.NewUserService(userRepo)
	userH := handler.NewUserHandler(userSvc)
	permH := handler.NewPermissionHandler(permSvc)
	dictH := handler.NewDictionaryHandler(model.DB)
	statsSvc := service.NewStatsService(model.DB)
	statsH := handler.NewStatsHandler(statsSvc, permSvc)
	exportSvc := service.NewExportService(model.DB)
	metaSvc := service.NewMetaService(model.DB, deps.Cfg.Server.RepoURL, deps.Cfg.Server.SemesterStart)
	metaH := handler.NewMetaHandler(metaSvc)
	summarySvc := service.NewSummaryService(model.DB, deps.Cfg.Server.SemesterStart)
	summaryH := handler.NewSummaryHandler(summarySvc, permSvc)
	exportH := handler.NewExportHandler(exportSvc, summarySvc, permSvc)
	feedbackSvc := service.NewFeedbackService(model.DB, deps.Cfg.GitHub.Token, deps.Cfg.GitHub.Repo)
	feedbackH := handler.NewFeedbackHandler(feedbackSvc)

	// 健康检查
	r.GET("/health", func(c *gin.Context) {
		c.JSON(200, gin.H{"status": "ok"})
	})

	api := r.Group("/api/v1")
	// 认证模块（无需鉴权）
	auth := api.Group("/auth")
	{
		auth.POST("/login", authH.Login)
	}

	// 需要 JWT 鉴权的接口
	authed := api.Group("")
	authed.Use(middleware.JWTAuth(deps.JWTMgr))
	{
		authed.GET("/auth/me", authH.Me)
		authed.POST("/auth/change-password", authH.ChangePassword)
		// 实时事件流（SSE）：数据变更时前端实时刷新
		authed.GET("/events", sseHandler)
		// 应用元信息（版本/更新日志/克隆引导/学期开始日期）
		authed.GET("/meta", metaH.Get)
		authed.POST("/meta/seen-changelog", metaH.MarkSeenChangelog)
		// 扣分记录
		records := authed.Group("/records")
		{
			records.POST("", recordH.Create)
			records.GET("", recordH.List)
			records.DELETE("/:id", middleware.RequireRole(model.RoleAdmin), recordH.Delete)
		}
		// 数据字典
		authed.GET("/dictionaries", dictH.List)
		// 扣分权限管理（管理员 / 班主任）
		perms := authed.Group("/permissions")
		{
			perms.GET("/me", permH.Me)
			perms.GET("/user/:id", middleware.RequireRole(model.RoleAdmin, model.RoleTeacher), permH.GetUserPermissions)
			perms.PUT("/user/:id", middleware.RequireRole(model.RoleAdmin, model.RoleTeacher), permH.SetUserPermissions)
		}
		// 统计 / 小结 / 汇总
		stats := authed.Group("/stats")
		{
			stats.GET("/personal", statsH.Personal)
			stats.GET("/overview", statsH.Overview)
			stats.GET("/summary", summaryH.Summary)                // 周/学期小结（1.1.0）
			stats.GET("/student-summary", summaryH.StudentSummary) // 每日/周/月同学扣分汇总（1.1.0）
		}
		// 导出
		authed.GET("/export/records", exportH.ExportRecords)
		authed.GET("/export/student-summary", exportH.ExportStudentSummary) // 同学汇总 Excel（1.1.0）
		// 意见反馈（1.1.0）
		feedback := authed.Group("/feedback")
		{
			feedback.POST("", feedbackH.Create) // 任何登录用户可提交
			feedback.GET("", middleware.RequireRole(model.RoleAdmin, model.RoleTeacher), feedbackH.List)
			feedback.PUT("/:id/status", middleware.RequireRole(model.RoleAdmin, model.RoleTeacher), feedbackH.UpdateStatus)
			feedback.POST("/:id/to-github", middleware.RequireRole(model.RoleAdmin, model.RoleTeacher), feedbackH.SyncToGitHub)
		}
		// 用户管理
		users := authed.Group("/users")
		{
			users.GET("", middleware.RequireRole(model.RoleAdmin, model.RoleTeacher), userH.List) // 管理员/班主任可查看用户
			users.GET("/students", userH.ListStudents)                                            // 学生录入时可用
			users.POST("", middleware.RequireRole(model.RoleAdmin), userH.Create)
			users.PUT("/:id", middleware.RequireRole(model.RoleAdmin), userH.Update)
			users.PUT("/:id/password", middleware.RequireRole(model.RoleAdmin), userH.ResetPassword)
			users.DELETE("/:id", middleware.RequireRole(model.RoleAdmin), userH.Delete)
		}
	}

	// 静态文件服务（前端页面）
	serveStatic(r)
}

// sseHandler 实时事件流（Server-Sent Events）
// GET /api/v1/events（需 JWT，token 通过 Authorization header 或 ?token= 传入）
// 前端用 EventSource 订阅，数据变更时收到 data_changed 事件
func sseHandler(c *gin.Context) {
	c.Writer.Header().Set("Content-Type", "text/event-stream")
	c.Writer.Header().Set("Cache-Control", "no-cache")
	c.Writer.Header().Set("Connection", "keep-alive")
	c.Writer.Header().Set("X-Accel-Buffering", "no")
	// 立即刷新响应头，让客户端尽快收到连接
	c.Writer.Flush()
	ch := realtime.Subscribe()
	defer realtime.Unsubscribe(ch)
	// 发送初始连接确认事件
	c.Writer.Write([]byte("event: connected\ndata: ok\n\n"))
	c.Writer.Flush()
	for {
		select {
		case msg, ok := <-ch:
			if !ok {
				return
			}
			c.Writer.Write(msg)
			c.Writer.Flush()
		case <-c.Request.Context().Done():
			// 客户端断开
			return
		}
	}
}

// serveStatic 服务前端静态文件（SPA 模式，所有非 API 路由回退到 index.html）
func serveStatic(r *gin.Engine) {
	// 尝试多个可能的静态目录
	candidates := []string{
		filepath.Join("web", "dist"),
		"web-glass",
		"web",
	}
	var staticDir string
	for _, c := range candidates {
		if fi, err := os.Stat(c); err == nil && fi.IsDir() {
			if entries, _ := os.ReadDir(c); len(entries) > 0 {
				staticDir = c
				break
			}
		}
	}
	if staticDir == "" {
		return // 没有找到前端目录，跳过
	}
	// 服务静态资源（css, js, assets）
	r.Use(func(c *gin.Context) {
		// 只处理非 API 请求
		path := c.Request.URL.Path
		if len(path) >= 4 && path[:4] == "/api" || path == "/health" {
			c.Next()
			return
		}
		// 尝试提供文件
		filePath := filepath.Join(staticDir, path)
		if info, err := os.Stat(filePath); err == nil && !info.IsDir() {
			c.File(filePath)
			c.Abort()
			return
		}
		// SPA 回退：所有未匹配的路由返回 index.html
		indexPath := filepath.Join(staticDir, "index.html")
		if _, err := os.Stat(indexPath); err == nil {
			c.File(indexPath)
			c.Abort()
			return
		}
		c.Next()
	})
}
