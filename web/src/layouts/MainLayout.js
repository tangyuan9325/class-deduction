import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessageBox } from 'element-plus'
import { getMeta, markSeenChangelog } from '@/api/meta'
import { useUserStore } from '@/store/user'

const route = useRoute()
const router = useRouter()
const userStore = useUserStore()
const collapsed = ref(false)
// 更新日志弹窗（首次进入更新后的系统时展示）
const changelogVisible = ref(false)
const changelogList = ref([])
let eventSource = null

// 菜单按权限动态显示：
//  - 班级看板/小结/同学汇总：班主任/管理员/viewer，或被分配"查看班级"权限的学生
//  - 录入扣分：班主任/管理员，或拥有任一扣分类别权限的学生
//  - 录入加分：班主任/管理员，或拥有"加分"权限的学生
//  - 扣分记录：班主任/管理员，或被分配"查看扣分记录"权限的学生
//  - 意见反馈：所有登录用户；关于与克隆：所有登录用户
//  - 用户管理：管理员/班主任
const allMenus = [
  { path: '/dashboard', title: '班级看板', icon: 'DataAnalysis', needView: true },
  { path: '/summary', title: '周/学期小结', icon: 'Calendar', needView: true },
  { path: '/student-summary', title: '同学扣分汇总', icon: 'TrendCharts', needView: true },
  { path: '/records/create', title: '录入扣分', icon: 'EditPen', needDeduct: true },
  { path: '/bonus/create', title: '录入加分', icon: 'Star', needBonus: true },
  { path: '/records/list', title: '扣分记录', icon: 'List', needViewRecords: true },
  { path: '/stats/personal', title: '个人统计', icon: 'User' },
  { path: '/feedback', title: '意见反馈', icon: 'ChatDotRound' },
  { path: '/about', title: '关于与克隆', icon: 'InfoFilled' },
  { path: '/users', title: '用户管理', icon: 'Setting', requireAdmin: true }
]

const menus = computed(() =>
  allMenus.filter((item) => {
    if (item.requireAdmin) return userStore.isAdmin || userStore.isTeacher
    if (item.needView) return userStore.isAdmin || userStore.isTeacher || userStore.isViewer || userStore.canViewAll
    if (item.needDeduct) return userStore.isAdmin || userStore.isTeacher || userStore.hasDeductPerm
    if (item.needBonus) return userStore.isAdmin || userStore.isTeacher || userStore.hasBonusPerm
    if (item.needViewRecords) return userStore.isAdmin || userStore.isTeacher || userStore.canViewRecords
    return true
  })
)

const activeMenu = computed(() => route.path)
const currentTitle = computed(() => route.meta.title || '')
const roleText = computed(() => {
  const m = { admin: '管理员', teacher: '班主任', student: '学生', viewer: '看板账号' }
  return m[userStore.role] || userStore.role
})
const roleTagType = computed(() => {
  if (userStore.role === 'admin') return 'danger'
  if (userStore.role === 'teacher') return 'warning'
  if (userStore.role === 'viewer') return 'success'
  return 'info'
})

function onCommand(cmd) {
  if (cmd === 'logout') {
    ElMessageBox.confirm('确定退出登录吗？', '提示', { type: 'warning' })
      .then(() => {
        userStore.logout()
        router.push('/login')
      })
      .catch(() => {})
  }
}

// 权限变更后刷新当前用户权限
async function refreshPerms() {
  await userStore.fetchPermissions()
}

// 更新日志：拉取元信息，若用户尚未阅读本次版本更新日志则弹窗展示
async function checkChangelog() {
  try {
    const meta = await getMeta()
    userStore.setMeta(meta)
    if (!meta.has_seen_changelog && meta.changelog && meta.changelog.length > 0) {
      changelogList.value = meta.changelog
      changelogVisible.value = true
    }
  } catch (e) {
    // 忽略
  }
}

// 关闭更新日志并标记已读
async function onChangelogClose() {
  changelogVisible.value = false
  try {
    await markSeenChangelog()
  } catch (e) {
    // 忽略
  }
}

// 实时同步：订阅后端 SSE 事件流，收到 data_changed 后广播给各页面刷新
function setupRealtime() {
  const token = userStore.token
  if (!token || eventSource) return
  try {
    eventSource = new EventSource(`/api/v1/events?token=${encodeURIComponent(token)}`)
    eventSource.addEventListener('data_changed', () => {
      window.dispatchEvent(new CustomEvent('app:data-changed'))
    })
    eventSource.onerror = () => {
      // 连接断开后自动重连（EventSource 默认行为）
    }
  } catch (e) {
    eventSource = null
  }
}

onMounted(async () => {
  await userStore.fetchPermissions()
  setupRealtime()
  checkChangelog()
  // 权限/数据变更后刷新权限（如班主任刚分配权限）
  window.addEventListener('app:data-changed', refreshPerms)
})

onBeforeUnmount(() => {
  window.removeEventListener('app:data-changed', refreshPerms)
  if (eventSource) {
    eventSource.close()
    eventSource = null
  }
})
