import { ref, reactive, onMounted } from 'vue'
import { Search, Refresh, Download } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { listRecords, deleteRecord } from '@/api/record'
import { exportRecords, saveBlob, parseFilename } from '@/api/export'
import { useUserStore } from '@/store/user'
import dayjs from 'dayjs'

const userStore = useUserStore()
const loading = ref(false)
const exporting = ref(false)
const list = ref([])
const total = ref(0)
const dateRange = ref([])

const query = reactive({
  page: 1,
  page_size: 20,
  category: '',
  subject_or_item: '',
  target_user_id: undefined,
  start_date: '',
  end_date: ''
})

function formatDate(d) {
  if (!d) return ''
  return dayjs(d).format('YYYY-MM-DD')
}

function buildParams() {
  const p = { page: query.page, page_size: query.page_size }
  if (query.category) p.category = query.category
  if (query.subject_or_item) p.subject_or_item = query.subject_or_item
  if (query.target_user_id) p.target_user_id = query.target_user_id
  if (dateRange.value && dateRange.value.length === 2) {
    p.start_date = dateRange.value[0]
    p.end_date = dateRange.value[1]
  }
  return p
}

async function loadData() {
  loading.value = true
  try {
    const res = await listRecords(buildParams())
    list.value = res.list || []
    total.value = res.total || 0
  } finally {
    loading.value = false
  }
}

function onSearch() {
  query.page = 1
  loadData()
}

function onReset() {
  query.category = ''
  query.subject_or_item = ''
  query.target_user_id = undefined
  dateRange.value = []
  onSearch()
}

async function onExport() {
  exporting.value = true
  try {
    const res = await exportRecords(buildParams())
    saveBlob(res, parseFilename(res))
    ElMessage.success('导出成功')
  } finally {
    exporting.value = false
  }
}

function onDelete(row) {
  ElMessageBox.confirm(`确定撤销「${row.target_name} - ${row.subject_or_item}」这条记录吗？`, '撤销确认', { type: 'warning' })
    .then(async () => {
      await deleteRecord(row.id)
      ElMessage.success('已撤销')
      loadData()
    })
    .catch(() => {})
}

onMounted(() => {
  loadData()
  window.addEventListener('app:data-changed', loadData)
})
