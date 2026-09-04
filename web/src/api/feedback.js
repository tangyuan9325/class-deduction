import request from '@/utils/request'
// 提交意见反馈（任何登录用户）
export function createFeedback(data) {
  return request.post('/feedback', data)
}
// 分页查询反馈（管理员/班主任）
export function listFeedback(params) {
  return request.get('/feedback', { params })
}
// 更新反馈状态
export function updateFeedbackStatus(id, status) {
  return request.put(`/feedback/${id}/status`, { status })
}
// 同步反馈到 GitHub Issues
export function syncFeedbackToGithub(id) {
  return request.post(`/feedback/${id}/to-github`)
}
