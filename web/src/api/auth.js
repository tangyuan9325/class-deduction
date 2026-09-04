import request from '@/utils/request'

// 登录
export function login(data) {
  return request.post('/auth/login', data)
}

// 获取当前用户信息
export function getMe() {
  return request.get('/auth/me')
}

// 修改密码（首次登录强制改密）
export function changePassword(data) {
  return request.post('/auth/change-password', data)
}
