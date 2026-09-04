import request from '@/utils/request'

// 分页查询用户（管理员）
export function listUsers(params) {
  return request.get('/users', { params })
}

// 学生列表（录入用）
export function listStudents(params) {
  return request.get('/users/students', { params })
}

// 创建用户
export function createUser(data) {
  return request.post('/users', data)
}

// 更新用户
export function updateUser(id, data) {
  return request.put(`/users/${id}`, data)
}

// 重置密码
export function resetPassword(id, password) {
  return request.put(`/users/${id}/password`, { password })
}

// 删除用户
export function deleteUser(id) {
  return request.delete(`/users/${id}`)
}

// 查询某用户的扣分权限（管理员/班主任）
export function getUserPermissions(id) {
  return request.get(`/permissions/user/${id}`)
}

// 设置某用户的扣分权限（管理员/班主任）
export function setUserPermissions(id, categories) {
  return request.put(`/permissions/user/${id}`, { categories })
}

// 查询当前登录用户自己的权限（学生判断是否有"查看班级"权限）
export function getMyPermissions() {
  return request.get('/permissions/me')
}
