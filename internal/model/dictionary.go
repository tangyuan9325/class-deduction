package model

import "time"

// Dictionary 数据字典表
// type 为扣分类别（学习/寝室/日常/两操），name 为该项目下的具体扣分项目
//
//	学习：语文/数学/英语/物理/化学/技术/地理/历史/生物/政治（各科作业上交情况）
//	寝室：地未拖/灯未关/垃圾未倒/地不干净/熄灯后聊天…
//	日常：迟到/卫生/纪律/其它
//	两操：早操迟到/早操缺席/课间操违纪/眼保健操/跑操秩序
type Dictionary struct {
	ID        int64     `gorm:"primaryKey;autoIncrement" json:"id"`
	Type      string    `gorm:"size:32;index;not null" json:"type"` // 学习 / 寝室 / 日常 / 两操
	Name      string    `gorm:"size:64;index;not null" json:"name"` // 扣分项目名称
	CreatedAt time.Time `json:"created_at"`
}

// TableName 表名
func (Dictionary) TableName() string { return "dictionaries" }

// 旧版字典类型（已废弃，仅用于启动时清理旧数据）
const (
	DictTypeSubject   = "subject"
	DictTypeDailyItem = "daily_item"
)

// 默认扣分项目字典：类别 -> 项目列表
var DefaultDictionary = map[string][]string{
	CategoryStudy: {
		"语文", "数学", "英语", "物理", "化学", "技术", "地理", "历史", "生物", "政治",
	},
	CategoryDorm: {
		"地未拖", "灯未关", "垃圾未倒", "地不干净", "熄灯后聊天", "床铺不整", "物品摆放乱",
	},
	CategoryDaily: {
		"迟到", "卫生", "纪律", "其它",
	},
	CategoryExercise: {
		"早操迟到", "早操缺席", "课间操违纪", "眼保健操", "跑操秩序",
	},
	// 1.1.0 新增加分项目字典
	CategoryBonus: {
		"助人为乐", "学习进步", "卫生优秀", "纪律良好", "比赛获奖", "班级贡献", "好人好事", "其它加分",
	},
}
