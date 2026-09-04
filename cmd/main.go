package main

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"class-deduction/config"
	"class-deduction/internal/model"
	"class-deduction/internal/router"
	"class-deduction/pkg/jwt"
	"class-deduction/pkg/logger"

	"github.com/gin-gonic/gin"
	"go.uber.org/zap"
)

func main() {
	// 1. 加载配置
	cfg, err := config.Load()
	if err != nil {
		fmt.Printf("load config failed: %v\n", err)
		os.Exit(1)
	}

	// 2. 初始化日志
	if err := logger.Init(cfg.Server.LogLevel); err != nil {
		fmt.Printf("init logger failed: %v\n", err)
		os.Exit(1)
	}
	defer logger.Sync()

	logger.L.Info("config loaded",
		zap.String("port", cfg.Server.Port),
		zap.String("driver", cfg.Database.Driver),
	)

	// 3. 初始化数据库
	if err := model.InitDB(cfg); err != nil {
		logger.L.Fatal("init database failed", zap.Error(err))
	}
	logger.L.Info("database initialized")

	// 4. 初始化 JWT 管理器
	jwtMgr := jwt.NewManager(cfg.JWT.Secret, cfg.JWT.ExpireHours)

	// 5. 启动 HTTP 服务
	gin.SetMode(gin.ReleaseMode)
	r := gin.New()
	router.Register(r, router.Deps{
		Cfg:    cfg,
		JWTMgr: jwtMgr,
	})

	srv := &http.Server{
		Addr:         ":" + cfg.Server.Port,
		Handler:      r,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 30 * time.Second,
	}

	// 6. 优雅启停
	go func() {
		logger.L.Info("server starting", zap.String("addr", srv.Addr))
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			logger.L.Fatal("listen failed", zap.Error(err))
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit
	logger.L.Info("shutting down server...")

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := srv.Shutdown(ctx); err != nil {
		logger.L.Error("server forced to shutdown", zap.Error(err))
	}
	logger.L.Info("server exited")
}
