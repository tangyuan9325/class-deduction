import { ref, reactive, onMounted, onBeforeUnmount, nextTick } from 'vue'
import * as echarts from 'echarts'
import { Search } from '@element-plus/icons-vue'
import { getPersonalStats } from '@/api/stats'
import { getMyPermissions } from '@/api/user'
import { useUserStore } from '@/store/user'
import dayjs from 'dayjs'

const userStore = useUserStore()
const barRef = ref(null)
const dateRange = ref([])
let barChart
const query = reactive({ user_id: undefined })
const data = ref({ total_score: 0, total_count: 0, by_subject: [], recent: [] })
// 是否可查看全班统计：班主任/管理员默认可以；学生需被分配"查看班级"权限
const canViewAll = ref(false)

async function loadPerm() {
  if (userStore.isAdmin || userStore.role === 'teacher') {
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

function fmt(d) { return d ? dayjs(d).format('YYYY-MM-DD') : '' }

function buildParams() {
  const p = {}
  if (query.user_id) p.user_id = query.user_id
  else p.user_id = userStore.user?.user_id
  if (dateRange.value && dateRange.value.length === 2) {
    p.start_date = dateRange.value[0]
    p.end_date = dateRange.value[1]
  }
  return p
}

async function loadData() {
  const res = await getPersonalStats(buildParams())
  data.value = res || data.value
  await nextTick()
  renderBar()
}

function renderBar() {
  if (!barRef.value) return
  if (!barChart) barChart = echarts.init(barRef.value, 'dark')
  const bs = data.value.by_subject || []
  barChart.setOption({
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    grid: { left: 40, right: 20, top: 30, bottom: 40 },
    xAxis: { type: 'category', data: bs.map((s) => s.name), axisLabel: { rotate: 30 } },
    yAxis: { type: 'value', name: '扣分' },
    series: [
      {
        name: '累计扣分',
        type: 'bar',
        data: bs.map((s) => s.score),
        itemStyle: { color: '#6ee7ff', borderRadius: [4, 4, 0, 0] }
      },
      {
        name: '次数',
        type: 'bar',
        data: bs.map((s) => s.count),
        itemStyle: { color: '#7c8cff', borderRadius: [4, 4, 0, 0] }
      }
    ]
  })
}

function onResize() { barChart?.resize() }
onMounted(async () => {
  await loadPerm()
  loadData()
  window.addEventListener('resize', onResize)
  window.addEventListener('app:data-changed', loadData)
})
onBeforeUnmount(() => {
  window.removeEventListener('resize', onResize)
  window.removeEventListener('app:data-changed', loadData)
  barChart?.dispose()
})
