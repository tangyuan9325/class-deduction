package model

import (
	"fmt"
	"time"

	"gorm.io/gorm"
)

// initDictionary 初始化数据字典：按扣分类别（学习/寝室/日常/两操）插入默认扣分项目
// 使用 FirstOrCreate 保证幂等，重复启动不会产生重复记录
func initDictionary(db *gorm.DB) error {
	// 清理旧版字典类型（subject / daily_item 已废弃，统一为四类扣分类别）
	if err := db.Where("type IN ?", []string{DictTypeSubject, DictTypeDailyItem}).
		Delete(&Dictionary{}).Error; err != nil {
		return err
	}
	for typ, names := range DefaultDictionary {
		for _, name := range names {
			if err := db.Where("type = ? AND name = ?", typ, name).
				FirstOrCreate(&Dictionary{Type: typ, Name: name}).
				Error; err != nil {
				return err
			}
		}
	}
	return nil
}

// initAdmin 初始化默认管理员账号
// 默认账号 admin / admin123，生产环境请尽快登录后修改
func initAdmin(db *gorm.DB) error {
	var cnt int64
	if err := db.Model(&User{}).Where("role = ?", RoleAdmin).Count(&cnt).Error; err != nil {
		return err
	}
	if cnt > 0 {
		return nil
	}
	admin := User{
		Username: "admin",
		RealName: "系统管理员",
		Role:     RoleAdmin,
	}
	if err := admin.SetPassword("admin123"); err != nil {
		return err
	}
	return db.Create(&admin).Error
}

// initHeadTeacher 初始化班主任账号（teacher 角色）
// 默认账号 banzhuren / 123456，姓名默认"崔孝禹"；
// 管理员可在「用户管理」中编辑班主任姓名（点击编辑修改真实姓名即可）。
func initHeadTeacher(db *gorm.DB) error {
	var cnt int64
	if err := db.Model(&User{}).Where("role = ?", RoleTeacher).Count(&cnt).Error; err != nil {
		return err
	}
	if cnt > 0 {
		return nil
	}
	ht := User{
		Username: "banzhuren",
		RealName: "崔孝禹",
		Role:     RoleTeacher,
		ClassID:  1,
	}
	if err := ht.SetPassword("123456"); err != nil {
		return err
	}
	return db.Create(&ht).Error
}

// initViewer 初始化班级看板只读账号（1.1.0）
// 默认账号 kandban / 123456，角色 viewer：可查看班级看板/个人统计/小结/汇总/反馈/关于，无任何录入与管理权限
// 班主任/管理员可在「用户管理」中为其重置密码
func initViewer(db *gorm.DB) error {
	var cnt int64
	if err := db.Model(&User{}).Where("username = ?", "kandban").Count(&cnt).Error; err != nil {
		return err
	}
	if cnt > 0 {
		return nil
	}
	v := User{
		Username: "kandban",
		RealName: "班级看板",
		Role:     RoleViewer,
		ClassID:  1,
	}
	if err := v.SetPassword("123456"); err != nil {
		return err
	}
	return db.Create(&v).Error
}

// initAppMeta 初始化应用元信息：写入当前版本、更新日志、默认学期开始日期
func initAppMeta(db *gorm.DB) error {
	now := time.Now()
	defaultSemester := now.Format("2006-01-02")
	items := map[string]string{
		MetaKeySemesterStart: defaultSemester,
	}
	for k, v := range items {
		var m AppMeta
		if err := db.Where("key = ?", k).First(&m).Error; err == nil {
			continue
		}
		if err := db.Create(&AppMeta{Key: k, Value: v}).Error; err != nil {
			return fmt.Errorf("create app meta %s failed: %w", k, err)
		}
	}
	return nil
}
