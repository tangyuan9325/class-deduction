package jwt

import (
	"errors"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

// Claims JWT 自定义声明
type Claims struct {
	UserID   int64  `json:"user_id"`
	Role     string `json:"role"`
	Username string `json:"username"`
	jwt.RegisteredClaims
}

// Manager JWT 签发与解析
type Manager struct {
	secret []byte
	expire time.Duration
}

// NewManager 构造 JWT 管理器
// secret: 签名密钥；expireHours: token 有效期（小时，临时登录默认值）
func NewManager(secret string, expireHours int) *Manager {
	return &Manager{
		secret: []byte(secret),
		expire: time.Duration(expireHours) * time.Hour,
	}
}

// Generate 生成 token（使用默认有效期）
func (m *Manager) Generate(userID int64, role, username string) (string, error) {
	return m.GenerateWithExpiryHours(userID, role, username, int(m.expire/time.Hour))
}

// GenerateWithExpiryHours 生成指定有效期的 token（保持登录 = 长时间；临时登录 = 短时间）
func (m *Manager) GenerateWithExpiryHours(userID int64, role, username string, expireHours int) (string, error) {
	if expireHours <= 0 {
		expireHours = int(m.expire / time.Hour)
	}
	claims := Claims{
		UserID:   userID,
		Role:     role,
		Username: username,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(time.Duration(expireHours) * time.Hour)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
			Issuer:    "class-deduction",
		},
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString(m.secret)
}

// Parse 解析并校验 token
func (m *Manager) Parse(tokenString string) (*Claims, error) {
	claims := &Claims{}
	token, err := jwt.ParseWithClaims(tokenString, claims, func(t *jwt.Token) (interface{}, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, errors.New("unexpected signing method")
		}
		return m.secret, nil
	})
	if err != nil {
		return nil, err
	}
	if !token.Valid {
		return nil, errors.New("invalid token")
	}
	return claims, nil
}
