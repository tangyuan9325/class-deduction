import { defineStore } from 'pinia'
import { getMe } from '@/api/auth'
import { getMyPermissions } from '@/api/user'

const DEDUCT_CATEGORIES = ['学习', '寝室', '日常', '两操']
const BONUS_CATEGORY = '加分'

// 从会话存储或本地存储读取 token（保持登录 → localStorage；临时登录 → sessionStorage）
function readToken() {
  return sessionStorage.getItem('token') || localStorage.getItem('token') || ''
}
function readUser() {
  const u = sessionStorage.getItem('user') || localStorage.getItem('user') || 'null'
  try {
    return JSON.parse(u)
  } catch (e) {
    return null
  }
}

export const useUserStore = defineStore('user', {
  state: () => ({
    token: readToken(),
    user: readUser(),
    // 当前用户权限：categories=扣分类别+查看班级+查看扣分记录；can_view_all=可查看班级整体统计
    permissions: { categories: [], can_view_all: false, can_view_records: false },
    // 应用元信息（版本/更新日志等）
    meta: null
  }),
  getters: {
    isLogin: (state) => !!state.token,
    role: (state) => state.user?.role || '',
    isAdmin: (state) => state.user?.role === 'admin',
    isTeacher: (state) => state.user?.role === 'teacher',
    isViewer: (state) => state.user?.role === 'viewer',
    realName: (state) => state.user?.real_name || state.user?.username || '',
    // 是否拥有任一扣分权限（可进入录入扣分）
    hasDeductPerm: (state) => {
      if (state.user?.role === 'admin' || state.user?.role === 'teacher') return true
      return (state.permissions.categories || []).some((c) => DEDUCT_CATEGORIES.includes(c))
    },
    // 是否拥有加分权限（可进入录入加分）
    hasBonusPerm: (state) => {
      if (state.user?.role === 'admin' || state.user?.role === 'teacher') return true
      return (state.permissions.categories || []).includes(BONUS_CATEGORY)
    },
    // 是否可查看班级整体统计/看板（班主任/管理员/看板账号默认可看；学生需被分配"查看班级"）
    canViewAll: (state) => {
      if (['admin', 'teacher', 'viewer'].includes(state.user?.role)) return true
      return !!state.permissions.can_view_all
    },
    // 是否可查看扣分记录（班主任/管理员默认可看；学生需被分配"查看扣分记录"）
    canViewRecords: (state) => {
      if (state.user?.role === 'admin' || state.user?.role === 'teacher') return true
      return !!state.permissions.can_view_records
    },
    // 是否可管理反馈（管理员/班主任）
    canManageFeedback: (state) => state.user?.role === 'admin' || state.user?.role === 'teacher'
  },
  actions: {
    // remember=true 保持登录（localStorage）；false 临时登录（sessionStorage）
    setToken(token, remember = true) {
      this.token = token
      if (remember) {
        localStorage.setItem('token', token)
        sessionStorage.removeItem('token')
      } else {
        sessionStorage.setItem('token', token)
        localStorage.removeItem('token')
      }
    },
    setUser(user, remember = true) {
      this.user = user
      if (remember) {
        localStorage.setItem('user', JSON.stringify(user))
        sessionStorage.removeItem('user')
      } else {
        sessionStorage.setItem('user', JSON.stringify(user))
        localStorage.removeItem('user')
      }
    },
    async fetchMe() {
      const me = await getMe()
      this.setUser(me)
      return me
    },
    // 拉取当前用户权限（学生判断可看/可录）
    async fetchPermissions() {
      try {
        const res = await getMyPermissions()
        this.permissions = {
          categories: res.categories || [],
          can_view_all: !!res.can_view_all,
          can_view_records: !!res.can_view_records
        }
      } catch (e) {
        this.permissions = { categories: [], can_view_all: false, can_view_records: false }
      }
      return this.permissions
    },
    setMeta(meta) {
      this.meta = meta
    },
    logout() {
      this.token = ''
      this.user = null
      this.permissions = { categories: [], can_view_all: false, can_view_records: false }
      this.meta = null
      sessionStorage.removeItem('token')
      sessionStorage.removeItem('user')
      localStorage.removeItem('token')
      localStorage.removeItem('user')
    }
  }
})
