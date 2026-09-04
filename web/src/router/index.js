import { createRouter, createWebHistory } from 'vue-router'
import { useUserStore } from '@/store/user'

const routes = [
  {
    path: '/login',
    name: 'Login',
    component: () => import('@/views/Login.vue'),
    meta: { public: true }
  },
  {
    path: '/change-password',
    name: 'ChangePassword',
    component: () => import('@/views/ChangePassword.vue'),
    meta: { title: '修改密码' }
  },
  {
    path: '/',
    component: () => import('@/layouts/MainLayout.vue'),
    redirect: '/dashboard',
    children: [
      {
        path: 'dashboard',
        name: 'Dashboard',
        component: () => import('@/views/Dashboard.vue'),
        meta: { title: '班级看板', icon: 'DataAnalysis' }
      },
      {
        path: 'summary',
        name: 'Summary',
        component: () => import('@/views/Summary.vue'),
        meta: { title: '周/学期小结', icon: 'Calendar' }
      },
      {
        path: 'student-summary',
        name: 'StudentSummary',
        component: () => import('@/views/StudentSummary.vue'),
        meta: { title: '同学扣分汇总', icon: 'TrendCharts' }
      },
      {
        path: 'records/create',
        name: 'RecordCreate',
        component: () => import('@/views/RecordCreate.vue'),
        meta: { title: '录入扣分', icon: 'EditPen' }
      },
      {
        path: 'bonus/create',
        name: 'BonusCreate',
        component: () => import('@/views/BonusCreate.vue'),
        meta: { title: '录入加分', icon: 'Star' }
      },
      {
        path: 'records/list',
        name: 'RecordList',
        component: () => import('@/views/RecordList.vue'),
        meta: { title: '扣分记录', icon: 'List' }
      },
      {
        path: 'stats/personal',
        name: 'PersonalStats',
        component: () => import('@/views/PersonalStats.vue'),
        meta: { title: '个人统计', icon: 'User' }
      },
      {
        path: 'feedback',
        name: 'Feedback',
        component: () => import('@/views/Feedback.vue'),
        meta: { title: '意见反馈', icon: 'ChatDotRound' }
      },
      {
        path: 'about',
        name: 'About',
        component: () => import('@/views/About.vue'),
        meta: { title: '关于与克隆', icon: 'InfoFilled' }
      },
      {
        path: 'users',
        name: 'UserManage',
        component: () => import('@/views/UserManage.vue'),
        meta: { title: '用户管理', icon: 'Setting', requireAdmin: true }
      }
    ]
  },
  { path: '/:pathMatch(.*)*', redirect: '/dashboard' }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

// 全局守卫：未登录跳登录页；按权限拦截页面
router.beforeEach(async (to, from, next) => {
  const userStore = useUserStore()
  if (to.meta.public) {
    return next()
  }
  if (!userStore.isLogin) {
    return next({ path: '/login', query: { redirect: to.fullPath } })
  }
  // 首次登录强制修改密码：未改密前只能访问改密页
  if (userStore.user?.must_change_password && to.path !== '/change-password') {
    return next({ path: '/change-password' })
  }
  // 需要管理员/班主任权限
  if (to.meta.requireAdmin && !userStore.isAdmin && !userStore.isTeacher) {
    return next({ path: '/dashboard' })
  }
  // 涉及看板/录入/记录/汇总的页面：先同步权限
  if (['/dashboard', '/records/create', '/records/list', '/bonus/create', '/summary', '/student-summary', '/feedback'].includes(to.path)) {
    try {
      await userStore.fetchPermissions()
    } catch (e) {
      // 忽略，按本地权限判断
    }
  }
  // 班级看板/小结/同学汇总：无查看权限的学生不可访问（viewer 可看）
  if ((to.path === '/dashboard' || to.path === '/summary' || to.path === '/student-summary') && !userStore.canViewAll) {
    return next({ path: '/stats/personal' })
  }
  // 录入扣分：无扣分权限的学生不可访问
  if (to.path === '/records/create' && !userStore.hasDeductPerm) {
    return next({ path: '/stats/personal' })
  }
  // 录入加分：无加分权限的学生不可访问
  if (to.path === '/bonus/create' && !userStore.hasBonusPerm) {
    return next({ path: '/stats/personal' })
  }
  // 扣分记录：无查看扣分记录权限的学生不可访问
  if (to.path === '/records/list' && !userStore.canViewRecords) {
    return next({ path: '/stats/personal' })
  }
  next()
})

export default router
