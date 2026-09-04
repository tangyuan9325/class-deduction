import { ref, onMounted, onBeforeUnmount, nextTick } from 'vue'
import * as echarts from 'echarts'
import { Search } from '@element-plus/icons-vue'
import { getOverviewStats } from '@/api/stats'

const pieRef = ref(null)
const lineRef = ref(null)
const dateRange = ref([])
let pieChart, lineChart
const data = ref({ total_score: 0, total_count: 0, by_subject: [], by_day: [], top_rank: [] })

function buildParams() {
  const p = {}
  if (dateRange.value && dateRange.value.length === 2) {
    p.start_date = dateRange.value[0]
    p.end_date = dateRange.value[1]
  }
  return p
}

async function loadData() {
  const res = await getOverviewStats(buildParams())
  data.value = res || data.value
  await nextTick()
  renderPie()
  renderLine()
}

function renderPie() {
  if (!pieRef.value) return
  if (!pieChart) pieChart = echarts.init(pieRef.value, 'dark')
  const bySubject = data.value.by_subject || []
  const pieData = bySubject.map((s) => ({ name: s.name, value: Math.abs(s.score) || s.count }))
  pieChart.setOption({
    tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
    legend: { bottom: 0, textStyle: { color: '#aab0b8' } },
    series: [
      {
        type: 'pie',
        radius: ['40%', '70%'],
        avoidLabelOverlap: false,
        itemStyle: { borderRadius: 6, borderColor: 'rgba(255,255,255,0.25)', borderWidth: 2 },
        label: { show: false },
        emphasis: { label: { show: true, fontSize: 14, fontWeight: 'bold' } },
        data: pieData
      }
    ]
  })
}

function renderLine() {
  if (!lineRef.value) return
  if (!lineChart) lineChart = echarts.init(lineRef.value, 'dark')
  const byDay = data.value.by_day || []
  lineChart.setOption({
    tooltip: { trigger: 'axis' },
    grid: { left: 40, right: 20, top: 30, bottom: 40 },
    xAxis: { type: 'category', data: byDay.map((d) => d.date), axisLabel: { rotate: 30 } },
    yAxis: [{ type: 'value', name: '扣分' }],
    series: [
      {
        name: '每日扣分',
        type: 'line',
        smooth: true,
        areaStyle: { opacity: 0.15 },
        data: byDay.map((d) => d.score),
        itemStyle: { color: '#ff6b81' },
        lineStyle: { color: '#ff6b81' }
      }
    ]
  })
}

function onResize() {
  pieChart?.resize()
  lineChart?.resize()
}

onMounted(() => {
  loadData()
  window.addEventListener('resize', onResize)
  window.addEventListener('app:data-changed', loadData)
})
onBeforeUnmount(() => {
  window.removeEventListener('resize', onResize)
  window.removeEventListener('app:data-changed', loadData)
  pieChart?.dispose()
  lineChart?.dispose()
})
