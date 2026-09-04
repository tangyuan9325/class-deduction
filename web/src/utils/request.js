import axios from 'axios'
import { ElMessage } from 'element-plus'

const request = axios.create({
  baseURL: '/api/v1',
  timeout: 15000
})

// 请求拦截：自动携带 token
request.interceptors.request.use(
  (config) => {
    const token = sessionStorage.getItem('token') || localStorage.getItem('token')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => Promise.reject(error)
)

// 响应拦截：统一处理后端返回结构 { code, message, data }
request.interceptors.response.use(
  (response) => {
    const res = response.data
    // 文件下载等非 JSON 响应直接放行
    if (response.config.responseType === 'blob') {
      return response
    }
    if (res.code === 0 || res.code === undefined) {
      return res.data !== undefined ? res.data : res
    }
    // 业务错误
    ElMessage.error(res.message || '请求失败')
    // 401 未授权：跳登录
    if (res.code === 10002 || res.code === 20003 || res.code === 20004) {
      sessionStorage.removeItem('token')
      sessionStorage.removeItem('user')
      localStorage.removeItem('token')
      localStorage.removeItem('user')
      // 避免循环引用，用原生跳转
      if (location.pathname !== '/login') {
        location.href = '/login'
      }
    }
    return Promise.reject(new Error(res.message || 'Error'))
  },
  (error) => {
    const status = error.response?.status
    const data = error.response?.data
    if (status === 401) {
      sessionStorage.removeItem('token')
      sessionStorage.removeItem('user')
      localStorage.removeItem('token')
      localStorage.removeItem('user')
      ElMessage.error('登录已过期，请重新登录')
      if (location.pathname !== '/login') location.href = '/login'
    } else {
      ElMessage.error(data?.message || error.message || '网络错误')
    }
    return Promise.reject(error)
  }
)

export default request
