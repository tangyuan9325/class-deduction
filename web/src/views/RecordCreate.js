import { ref, reactive, computed, onMounted, watch } from 'vue'
import { Search } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { listStudents } from '@/api/user'
import { listDictionaries } from '@/api/dictionary'
import { createRecords } from '@/api/record'
import { useUserStore } from '@/store/user'

const userStore = useUserStore()
const formRef = ref()
const tableRef = ref()
const loading = ref(false)
const students = ref([])
const dictItems = ref([])
const selectedIds = ref([])
const keyword = ref('')

const form = reactive({
  category: '学习',
  subject_or_item: '',
  score: -2,
  reason: '',
  record_date: ''
})

const rules = {
  category: [{ required: true, message: '请选择类别', trigger: 'change' }],
  subject_or_item: [{ required: true, message: '请选择科目/项目', trigger: 'change' }],
  score: [{ required: true, message: '请填写分值', trigger: 'blur' }]
}

// 根据类别显示对应字典（字典 type 与扣分类别一致：学习/寝室/日常/两操）
const dictOptions = computed(() => {
  return dictItems.value.filter((d) => d.type === form.category)
})

const filteredStudents = computed(() => {
  if (!keyword.value) return students.value
  const kw = keyword.value.toLowerCase()
  return students.value.filter(
    (s) => (s.real_name || '').toLowerCase().includes(kw) || (s.username || '').toLowerCase().includes(kw)
  )
})

async function loadStudents() {
  const list = await listStudents()
  students.value = list || []
}

async function loadDict() {
  const list = await listDictionaries()
  dictItems.value = list || []
}

function onSelectionChange(rows) {
  selectedIds.value = rows.map((r) => r.id)
}

function onCategoryChange() {
  form.subject_or_item = ''
}

async function onSubmit() {
  if (selectedIds.value.length === 0) {
    ElMessage.warning('请先勾选学生')
    return
  }
  await formRef.value.validate(async (valid) => {
    if (!valid) return
    loading.value = true
    try {
      await createRecords({
        target_user_ids: selectedIds.value,
        category: form.category,
        subject_or_item: form.subject_or_item,
        score: form.score,
        reason: form.reason,
        record_date: form.record_date
      })
      ElMessage.success(`已为 ${selectedIds.value.length} 名学生录入扣分`)
      tableRef.value.clearSelection()
    } catch (e) {
      // 拦截器已提示
    } finally {
      loading.value = false
    }
  })
}

onMounted(() => {
  loadStudents()
  loadDict()
})
