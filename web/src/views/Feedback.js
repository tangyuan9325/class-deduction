import { ref, reactive, computed, onMounted } from 'vue'
import { Promotion, Search } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { createFeedback, listFeedback, updateFeedbackStatus, syncFeedbackToGithub } from '@/api/feedback'
import { getMeta } from '@/api/meta'
import { useUserStore } from '@/store/user'
import dayjs from 'dayjs'

const userStore = useUserStore()
const formRef = ref()
const submitting = ref(false)
const loading = ref(false)
const list = ref([])
const total = ref(0)
const form = reactive({ content: '', contact: '' })
const rules = {
  content: [{ required: true, message: '请输入意见建议', trigger: 'blur' }]
}
const query = reactive({ page: 1, page_size: 20, status: '' })
const canManageFeedback = computed(() => userStore.canManageFeedback)
const githubRepo = ref('')
const githubIssuesUrl = computed(() => (githubRepo.value ? `https://github.com/${githubRepo.value}/issues` : ''))

function fmt(d) {
  return d ? dayjs(d).format('YYYY-MM-DD HH:mm') : ''
}
function roleText(r) {
  return { admin: '管理员', teacher: '班主任', student: '学生', viewer: '看板账号' }[r] || r
}
function statusText(s) {
  return { open: '待处理', processing: '处理中', resolved: '已处理', closed: '已关闭' }[s] || s
}
function statusType(s) {
  if (s === 'resolved') return 'success'
  if (s === 'processing') return 'warning'
  if (s === 'closed') return 'info'
  return 'danger'
}

async function onSubmit() {
  await formRef.value.validate(async (valid) => {
    if (!valid) return
    submitting.value = true
    try {
      await createFeedback({ content: form.content, contact: form.contact })
      ElMessage.success('反馈提交成功，感谢你的建议！')
      form.content = ''
      form.contact = ''
    } catch (e) {
      // 拦截器已提示
    } finally {
      submitting.value = false
    }
  })
}

async function loadList() {
  loading.value = true
  try {
    const res = await listFeedback({ page: query.page, page_size: query.page_size, status: query.status })
    list.value = res.list || []
    total.value = res.total || 0
  } finally {
    loading.value = false
  }
}

async function onStatus(row, status) {
  await updateFeedbackStatus(row.id, status)
  ElMessage.success('状态已更新')
  loadList()
}

async function onSync(row) {
  if (!githubRepo.value) {
    ElMessage.warning('系统尚未配置 GitHub 仓库，无法同步')
    return
  }
  ElMessageBox.confirm('确定将该条反馈同步为 GitHub Issue 吗？', '同步确认', { type: 'warning' })
    .then(async () => {
      row.syncing = true
      try {
        const res = await syncFeedbackToGithub(row.id)
        ElMessage.success(`已同步，Issue #${res.issue_number}`)
        loadList()
      } catch (e) {
        // 拦截器已提示
      } finally {
        row.syncing = false
      }
    })
    .catch(() => {})
}

onMounted(async () => {
  try {
    const meta = await getMeta()
    userStore.setMeta(meta)
    githubRepo.value = (meta.repo_url || '').replace(/^https?:\/\/github\.com\//, '').replace(/\.git$/, '')
  } catch (e) {
    // 忽略
  }
  if (canManageFeedback.value) {
    loadList()
  }
})
