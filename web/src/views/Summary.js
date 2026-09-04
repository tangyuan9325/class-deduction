import { ref, reactive, onMounted } from 'vue'
import { Search } from '@element-plus/icons-vue'
import { getSummary } from '@/api/summary'
import { getMyPermissions } from '@/api/user'
import { useUserStore } from '@/store/user'

const userStore = useUserStore()
const scope = ref('class')
const period = ref('week')
const dateRange = ref([])
const query = reactive({ user_id: undefined })
const data = ref({
  scope: 'class', period: 'week', period_label: '', start_date: '', end_date: '',
  total_deduct: 0, total_bonus: 0, net_score: 0, total_count: 0,
  by_category: [], top_deduct: [], top_bonus: []
})
const canViewAll = ref(false)

async function loadPerm() {
  if (['admin', 'teacher', 'viewer'].includes(userStore.role)) {
    canViewAll.value = true
    return
  }
  try {
    const res = await getMyPermissions()
    canViewAll.value = !!res.can_view_all
  } catch (e) {
    canViewAll.value = false
  }
}

function buildParams() {
  const p = { scope: scope.value, period: period.value }
  if (scope.value === 'personal') {
    p.user_id = query.user_id || userStore.user?.user_id
  }
  if (dateRange.value && dateRange.value.length === 2) {
    p.start_date = dateRange.value[0]
    p.end_date = dateRange.value[1]
  }
  return p
}

async function loadData() {
  const res = await getSummary(buildParams())
  data.value = res || data.value
}

onMounted(async () => {
  await loadPerm()
  loadData()
  window.addEventListener('app:data-changed', loadData)
})
