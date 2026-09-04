import { ref, reactive, onMounted } from 'vue'
import { Search, Download } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { getStudentSummary, exportStudentSummary } from '@/api/summary'
import { saveBlob, parseFilename } from '@/api/export'

const period = ref('daily')
const dateRange = ref([])
const loading = ref(false)
const exporting = ref(false)
const data = ref({ period: 'daily', period_label: '', start_date: '', end_date: '', rows: [] })

function buildParams() {
  const p = { period: period.value }
  if (dateRange.value && dateRange.value.length === 2) {
    p.start_date = dateRange.value[0]
    p.end_date = dateRange.value[1]
  }
  return p
}

async function loadData() {
  loading.value = true
  try {
    const res = await getStudentSummary(buildParams())
    data.value = res || data.value
  } finally {
    loading.value = false
  }
}

function onSearch() {
  loadData()
}

async function onExport() {
  exporting.value = true
  try {
    const res = await exportStudentSummary(buildParams())
    saveBlob(res, parseFilename(res))
    ElMessage.success('导出成功')
  } finally {
    exporting.value = false
  }
}

onMounted(() => {
  loadData()
  window.addEventListener('app:data-changed', loadData)
})
