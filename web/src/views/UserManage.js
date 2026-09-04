import { ref, reactive, onMounted } from 'vue'
import { Search, Plus } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  listUsers,
  createUser,
  updateUser,
  resetPassword,
  deleteUser,
  getUserPermissions,
  setUserPermissions
} from '@/api/user'

const loading = ref(false)
const submitting = ref(false)
const list = ref([])
const total = ref(0)
const formRef = ref()

const query = reactive({ page: 1, page_size: 20, role: '', keyword: '' })

const form = reactive({ id: null, username: '', password: '', real_name: '', role: 'student', class_id: 0 })
const rules = {
  username: [{ required: true, message: '请输入账号', trigger: 'blur' }],
  password: [{ required: true, message: '请输入密码', trigger: 'blur' }],
  real_name: [{ required: true, message: '请输入姓名', trigger: 'blur' }],
  role: [{ required: true, message: '请选择角色', trigger: 'change' }]
}
const dialog = reactive({ visible: false, title: '' })

const pwdDialog = reactive({ visible: false, loading: false, id: 0, name: '', password: '' })
const permDialog = reactive({ visible: false, loading: false, id: 0, name: '', categories: [] })

function roleText(r) {
  return { admin: '管理员', teacher: '班主任', student: '学生' }[r] || r
}
function roleTagType(r) {
  if (r === 'admin') return 'danger'
  if (r === 'teacher') return 'warning'
  return 'info'
}

async function loadData() {
  loading.value = true
  try {
    const res = await listUsers({ page: query.page, page_size: query.page_size, role: query.role, keyword: query.keyword })
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

function onAdd() {
  Object.assign(form, { id: null, username: '', password: '', real_name: '', role: 'student', class_id: 0 })
  dialog.title = '新增用户'
  dialog.visible = true
}

function onEdit(row) {
  Object.assign(form, { id: row.id, username: row.username, password: '', real_name: row.real_name, role: row.role, class_id: row.class_id })
  dialog.title = '编辑用户'
  dialog.visible = true
}

async function onSubmit() {
  await formRef.value.validate(async (valid) => {
    if (!valid) return
    submitting.value = true
    try {
      if (form.id) {
        await updateUser(form.id, { real_name: form.real_name, role: form.role, class_id: form.class_id })
      } else {
        await createUser({
          username: form.username,
          password: form.password,
          real_name: form.real_name,
          role: form.role,
          class_id: form.class_id
        })
      }
      ElMessage.success(form.id ? '更新成功' : '创建成功')
      dialog.visible = false
      loadData()
    } finally {
      submitting.value = false
    }
  })
}

function onReset(row) {
  Object.assign(pwdDialog, { visible: true, loading: false, id: row.id, name: row.real_name || row.username, password: '' })
}

async function onSubmitPwd() {
  if (!pwdDialog.password) {
    ElMessage.warning('请输入新密码')
    return
  }
  pwdDialog.loading = true
  try {
    await resetPassword(pwdDialog.id, pwdDialog.password)
    ElMessage.success('密码已重置')
    pwdDialog.visible = false
  } finally {
    pwdDialog.loading = false
  }
}

function onDelete(row) {
  ElMessageBox.confirm(`确定删除用户「${row.real_name || row.username}」吗？`, '删除确认', { type: 'warning' })
    .then(async () => {
      await deleteUser(row.id)
      ElMessage.success('已删除')
      loadData()
    })
    .catch(() => {})
}

// 打开分配扣分权限弹窗（拉取该学生已有权限）
async function onPermission(row) {
  Object.assign(permDialog, { visible: true, loading: false, id: row.id, name: row.real_name || row.username, categories: [] })
  try {
    const res = await getUserPermissions(row.id)
    permDialog.categories = res.categories || []
  } catch (e) {
    // 拦截器已提示
  }
}

// 保存扣分权限
async function onSubmitPerm() {
  permDialog.loading = true
  try {
    await setUserPermissions(permDialog.id, permDialog.categories)
    ElMessage.success('权限已更新')
    permDialog.visible = false
    loadData()
  } catch (e) {
    // 拦截器已提示
  } finally {
    permDialog.loading = false
  }
}

onMounted(loadData)
