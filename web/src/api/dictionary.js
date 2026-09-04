import request from '@/utils/request'

// 查询字典 type=subject | daily_item | 空
export function listDictionaries(params) {
  return request.get('/dictionaries', { params })
}
