import request from '@/utils/request'

// 批量新增扣分记录
export function createRecords(data) {
  return request.post('/records', data)
}

// 分页查询扣分记录
export function listRecords(params) {
  return request.get('/records', { params })
}

// 删除（撤销）扣分记录
export function deleteRecord(id) {
  return request.delete(`/records/${id}`)
}
