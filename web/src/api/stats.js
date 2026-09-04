import request from '@/utils/request'

// 个人统计
export function getPersonalStats(params) {
  return request.get('/stats/personal', { params })
}

// 班级看板
export function getOverviewStats(params) {
  return request.get('/stats/overview', { params })
}
