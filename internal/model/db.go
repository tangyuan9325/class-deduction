package model

import (
	"fmt"
	"log"
	"os"
	"strings"
	"time"

	"class-deduction/config"
	"github.com/glebarez/sqlite"
	"gorm.io/driver/mysql"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

// DB 全局数据库句柄
var DB *gorm.DB

// InitDB 初始化数据库连接并执行表迁移
// 支持两种驱动：sqlite（默认，零安装）/ mysql
func InitDB(cfg *config.Config) error {
	dsn := cfg.Database.DSN
	driver := strings.ToLower(cfg.Database.Driver)
	if dsn == "" || contains(dsn, "yourpassword") {
		log.Println("[WARN] 数据库 DSN 未配置或仍为占位符，请检查 config/config.yaml")
	}

	gormCfg := &gorm.Config{
		Logger: logger.New(
			log.New(os.Stdout, "\r\n", log.LstdFlags),
			logger.Config{
				SlowThreshold:             200 * time.Millisecond,
				LogLevel:                  logger.Warn,
				IgnoreRecordNotFoundError: true,
				Colorful:                  true,
			},
		),
	}

	var db *gorm.DB
	var err error
	switch driver {
	case "mysql":
		db, err = gorm.Open(mysql.Open(dsn), gormCfg)
	case "sqlite", "":
		if dsn == "" || dsn == "class.db" {
			dsn = "class.db"
		}
		db, err = gorm.Open(sqlite.Open(dsn), gormCfg)
	default:
		return fmt.Errorf("unsupported database driver: %s", driver)
	}
	if err != nil {
		return fmt.Errorf("connect database failed: %w", err)
	}

	sqlDB, err := db.DB()
	if err != nil {
		return fmt.Errorf("get underlying sql.DB failed: %w", err)
	}
	sqlDB.SetMaxIdleConns(cfg.Database.MaxIdleConns)
	sqlDB.SetMaxOpenConns(cfg.Database.MaxOpenConns)
	sqlDB.SetConnMaxLifetime(time.Hour)

	DB = db

	// 自动迁移表结构
	if err := db.AutoMigrate(
		&User{},
		&DeductionRecord{},
		&Dictionary{},
		&DeductionPermission{},
		&Feedback{},
		&AppMeta{},
	); err != nil {
		return fmt.Errorf("auto migrate failed: %w", err)
	}

	// 数据字典初始化（四类扣分项目 + 加分项目）
	if err := initDictionary(db); err != nil {
		return fmt.Errorf("init dictionary failed: %w", err)
	}

	// 初始化默认管理员账号
	if err := initAdmin(db); err != nil {
		return fmt.Errorf("init admin failed: %w", err)
	}

	// 初始化班主任账号（默认崔孝禹）
	if err := initHeadTeacher(db); err != nil {
		return fmt.Errorf("init head teacher failed: %w", err)
	}

	// 初始化班级看板只读账号（1.1.0）
	if err := initViewer(db); err != nil {
		return fmt.Errorf("init viewer failed: %w", err)
	}

	// 初始化应用元信息（版本/学期开始日期等）
	if err := initAppMeta(db); err != nil {
		return fmt.Errorf("init app meta failed: %w", err)
	}

	return nil
}

func contains(s, sub string) bool {
	return len(s) >= len(sub) && (s == sub || len(sub) == 0 ||
		(len(s) > 0 && indexOf(s, sub) >= 0))
}

func indexOf(s, sub string) int {
	for i := 0; i+len(sub) <= len(s); i++ {
		if s[i:i+len(sub)] == sub {
			return i
		}
	}
	return -1
}
