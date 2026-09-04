import request from '@/utils/request'
// 周小结 / 学期小结（班级 or 个人）
// scope: class | personal；period: week | semester
export function getSummary(params) {
  return request.get('/stats/summary', { params })
}
// 每个同学的 每日/每周/每月 扣分点汇总
// period: daily | weekly | monthly
export function getStudentSummary(params) {
  return request.get('/stats/student-summary', { params })
}
// 导出同学汇总 Excel（blob）
export function exportStudentSummary(params) {
  return request.get('/export/student-summary', { params, responseType: 'blob' })
}
