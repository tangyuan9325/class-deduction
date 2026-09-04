import request from '@/utils/request'
// 获取应用元信息（版本/更新日志/克隆仓库引导/学期开始日期）
export function getMeta() {
  return request.get('/meta')
}
// 标记当前用户已读本次更新日志
export function markSeenChangelog() {
  return request.post('/meta/seen-changelog')
}
