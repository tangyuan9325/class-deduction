package config

import (
	"fmt"
	"os"
	"strings"

	"github.com/spf13/viper"
)

// Config 全局配置
type Config struct {
	Server   ServerConfig   `mapstructure:"server"`
	Database DatabaseConfig `mapstructure:"database"`
	JWT      JWTConfig      `mapstructure:"jwt"`
	GitHub   GitHubConfig   `mapstructure:"github"`
}

type ServerConfig struct {
	Port          string `mapstructure:"port"`
	LogLevel      string `mapstructure:"log_level"`
	RepoURL       string `mapstructure:"repo_url"`       // GitHub 仓库地址（关于页/克隆引导）
	SemesterStart string `mapstructure:"semester_start"` // 学期开始日期 YYYY-MM-DD（周/学期小结基准）
}

type DatabaseConfig struct {
	Driver       string `mapstructure:"driver"`
	DSN          string `mapstructure:"dsn"`
	MaxIdleConns int    `mapstructure:"max_idle_conns"`
	MaxOpenConns int    `mapstructure:"max_open_conns"`
}

type JWTConfig struct {
	Secret        string `mapstructure:"secret"`
	ExpireHours   int    `mapstructure:"expire_hours"`   // 临时登录 Token 有效期（小时）
	RememberHours int    `mapstructure:"remember_hours"` // 保持登录 Token 有效期（小时）
}

// GitHubConfig GitHub 集成（意见反馈同步到 GitHub Issues）
type GitHubConfig struct {
	Token string `mapstructure:"token"` // GitHub Personal Access Token（推荐用环境变量 APP_GITHUB_TOKEN 注入，勿入库）
	Repo  string `mapstructure:"repo"`  // 仓库名，格式 owner/repo，如 tangyuan9325/class-deduction
}

// Load 加载配置文件
// 默认读取项目根目录下 config/config.yaml，
// 也可通过环境变量 CONFIG_PATH 指定路径，或通过环境变量覆盖单个配置项（前缀 APP_）。
func Load() (*Config, error) {
	v := viper.New()
	cfgPath := os.Getenv("CONFIG_PATH")
	if cfgPath == "" {
		v.SetConfigName("config")
		v.SetConfigType("yaml")
		v.AddConfigPath(".")
		v.AddConfigPath("./config")
		v.AddConfigPath("../config")
	} else {
		v.SetConfigFile(cfgPath)
	}
	v.SetDefault("server.port", "8080")
	v.SetDefault("server.log_level", "info")
	v.SetDefault("server.repo_url", "")
	v.SetDefault("server.semester_start", "")
	v.SetDefault("database.driver", "mysql")
	v.SetDefault("database.max_idle_conns", 10)
	v.SetDefault("database.max_open_conns", 100)
	v.SetDefault("jwt.secret", "change-this-secret-in-production")
	v.SetDefault("jwt.expire_hours", 2)
	v.SetDefault("jwt.remember_hours", 720)
	v.SetDefault("github.token", "")
	v.SetDefault("github.repo", "")
	v.SetEnvPrefix("APP")
	v.SetEnvKeyReplacer(strings.NewReplacer(".", "_"))
	v.AutomaticEnv()
	if err := v.ReadInConfig(); err != nil {
		if _, ok := err.(viper.ConfigFileNotFoundError); !ok {
			return nil, fmt.Errorf("read config failed: %w", err)
		}
	}
	var cfg Config
	if err := v.Unmarshal(&cfg); err != nil {
		return nil, fmt.Errorf("unmarshal config failed: %w", err)
	}
	return &cfg, nil
}
