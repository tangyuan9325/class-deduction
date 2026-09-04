package logger

import (
	"os"
	"strings"

	"go.uber.org/zap"
	"go.uber.org/zap/zapcore"
)

// L 全局 logger 句柄，启动时由 Init 设置
var L *zap.Logger

// Init 初始化 zap logger。level: debug/info/warn/error
func Init(level string) error {
	lvl := zapcore.InfoLevel
	switch strings.ToLower(level) {
	case "debug":
		lvl = zapcore.DebugLevel
	case "info":
		lvl = zapcore.InfoLevel
	case "warn":
		lvl = zapcore.WarnLevel
	case "error":
		lvl = zapcore.ErrorLevel
	}

	encoderCfg := zap.NewProductionEncoderConfig()
	encoderCfg.EncodeTime = zapcore.ISO8601TimeEncoder
	encoderCfg.EncodeLevel = zapcore.CapitalLevelEncoder

	config := zap.Config{
		Level:             zap.NewAtomicLevelAt(lvl),
		Development:       false,
		DisableCaller:     false,
		DisableStacktrace: false,
		Encoding:          "console",
		EncoderConfig:     encoderCfg,
		OutputPaths:       []string{"stdout"},
		ErrorOutputPaths:  []string{"stderr"},
	}

	var err error
	L, err = config.Build()
	if err != nil {
		return err
	}
	zap.ReplaceGlobals(L)
	return nil
}

// Sync 在退出前 flush 缓冲
func Sync() {
	if L != nil {
		_ = L.Sync()
	}
}

// 兜底：若未初始化，避免 nil panic
func init() {
	if L == nil {
		l, _ := zap.NewDevelopment()
		L = l
		_ = os.Setenv("ZAP_FALLBACK", "1")
	}
}
