import { ref, reactive, computed, onMounted } from 'vue'
import { Search } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { listStudents } from '@/api/user'
import { listDictionaries } from '@/api/dictionary'
import { createRecords } from '@/api/record'

const formRef = ref()
const tableRef = ref()
const loading = ref(false)
const students = ref([])
const dictItems = ref([])
const selectedIds = ref([])
const keyword = ref('')
const form = reactive({
  subject_or_item: '',
  score: 2,
  reason: '',
  record_date: ''
})
const rules = {
  subject_or_item: [{ required: true, message: '请选择加分项目', trigger: 'change' }],
  score: [{ required: true, message: '请填写分值', trigger: 'blur' }]
}

// 加分项目字典（type=加分）
const bonusOptions = computed(() => dictItems.value.filter((d) => d.type === '加分'))

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
        category: '加分',
        subject_or_item: form.subject_or_item,
        score: form.score,
        reason: form.reason,
        record_date: form.record_date
      })
      ElMessage.success(`已为 ${selectedIds.value.length} 名学生录入加分`)
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
