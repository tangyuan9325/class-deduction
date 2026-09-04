package realtime

import (
	"fmt"
	"sync"
)

// Hub 全局实时事件广播中心（Server-Sent Events 后端）
// 任何数据变更（新增/删除扣分记录、用户变更）都通过 Publish 广播，
// 所有已连接的 SSE 客户端（前端页面）会收到 data_changed 事件并刷新数据。
type Hub struct {
	mu      sync.RWMutex
	clients map[chan []byte]struct{}
}

// defaultHub 全局单例
var defaultHub = NewHub()

// NewHub 构造 Hub
func NewHub() *Hub {
	return &Hub{clients: make(map[chan []byte]struct{})}
}

// Subscribe 注册一个客户端 channel，返回接收事件的管道
func (h *Hub) Subscribe() chan []byte {
	ch := make(chan []byte, 16)
	h.mu.Lock()
	h.clients[ch] = struct{}{}
	h.mu.Unlock()
	return ch
}

// Unsubscribe 注销客户端并关闭其管道
func (h *Hub) Unsubscribe(ch chan []byte) {
	h.mu.Lock()
	if _, ok := h.clients[ch]; ok {
		delete(h.clients, ch)
		close(ch)
	}
	h.mu.Unlock()
}

// Publish 向所有客户端广播 data_changed 事件（非阻塞，防止慢客户端拖垮写入方）
func (h *Hub) Publish(event string) {
	msg := []byte(fmt.Sprintf("event: data_changed\ndata: %s\n\n", event))
	h.mu.RLock()
	for ch := range h.clients {
		select {
		case ch <- msg:
		default: // 客户端缓冲满则丢弃本次事件，避免阻塞
		}
	}
	h.mu.RUnlock()
}

// Publish 全局便捷函数：广播数据变更事件
func Publish(event string) { defaultHub.Publish(event) }

// Subscribe 全局便捷函数：注册客户端
func Subscribe() chan []byte { return defaultHub.Subscribe() }

// Unsubscribe 全局便捷函数：注销客户端
func Unsubscribe(ch chan []byte) { defaultHub.Unsubscribe(ch) }
