package middleware

import (
	"strings"

	"class-deduction/pkg/errcode"
	"class-deduction/pkg/jwt"
	"class-deduction/pkg/logger"
	"class-deduction/pkg/response"

	"github.com/gin-gonic/gin"
	"go.uber.org/zap"
)

// 上下文键
const (
	CtxKeyUserID   = "user_id"
	CtxKeyUsername = "username"
	CtxKeyRole     = "role"
)

// JWTAuth JWT 鉴权中间件
// 从 Authorization: Bearer <token> 解析并校验，通过后将用户信息写入 gin.Context。
// 也支持通过 query 参数 ?token=xxx 传递（供 EventSource/SSE 等无法设置 header 的场景）。
func JWTAuth(j *jwt.Manager) gin.HandlerFunc {
	return func(c *gin.Context) {
		authHeader := c.GetHeader("Authorization")
		token := ""
		if authHeader == "" {
			token = c.Query("token")
		} else {
			parts := strings.SplitN(authHeader, " ", 2)
			if len(parts) != 2 || !strings.EqualFold(parts[0], "Bearer") || parts[1] == "" {
				response.Fail(c, errcode.ErrTokenInvalid)
				c.Abort()
				return
			}
			token = parts[1]
		}
		if token == "" {
			response.Fail(c, errcode.ErrUnauthorized)
			c.Abort()
			return
		}
		claims, err := j.Parse(token)
		if err != nil {
			logger.L.Warn("jwt parse failed", zap.Error(err))
			response.Fail(c, errcode.ErrTokenInvalid)
			c.Abort()
			return
		}
		c.Set(CtxKeyUserID, claims.UserID)
		c.Set(CtxKeyUsername, claims.Username)
		c.Set(CtxKeyRole, claims.Role)
		c.Next()
	}
}

// RequireRole 角色校验中间件，要求当前用户角色属于 roles 之一
// 需配合 JWTAuth 使用
func RequireRole(roles ...string) gin.HandlerFunc {
	return func(c *gin.Context) {
		role, _ := c.Get(CtxKeyRole)
		cur, _ := role.(string)
		for _, r := range roles {
			if r == cur {
				c.Next()
				return
			}
		}
		response.Fail(c, errcode.ErrForbidden)
		c.Abort()
	}
}

// UserIDFromContext 从 gin.Context 取出当前登录用户 ID
func UserIDFromContext(c *gin.Context) int64 {
	v, _ := c.Get(CtxKeyUserID)
	id, _ := v.(int64)
	return id
}

// UsernameFromContext 从 gin.Context 取出当前登录用户名
func UsernameFromContext(c *gin.Context) string {
	v, _ := c.Get(CtxKeyUsername)
	name, _ := v.(string)
	return name
}

// RoleFromContext 从 gin.Context 取出当前登录用户角色
func RoleFromContext(c *gin.Context) string {
	v, _ := c.Get(CtxKeyRole)
	role, _ := v.(string)
	return role
}
