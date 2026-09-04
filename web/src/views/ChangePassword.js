import { ref, reactive, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { User, Lock } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { changePassword } from '@/api/auth'
import { useUserStore } from '@/store/user'

const router = useRouter()
const userStore = useUserStore()
const formRef = ref()
const loading = ref(false)

const form = reactive({ real_name: '', new_password: '', confirm_password: '' })
const rules = {
  real_name: [{ required: true, message: '请输入姓名', trigger: 'blur' }],
  new_password: [
    { required: true, message: '请输入新密码', trigger: 'blur' },
    { min: 6, message: '密码至少 6 位', trigger: 'blur' }
  ],
  confirm_password: [
    { required: true, message: '请再次输入新密码', trigger: 'blur' },
    {
      validator: (rule, value, callback) => {
        if (value !== form.new_password) {
          callback(new Error('两次输入的密码不一致'))
        } else {
          callback()
        }
      },
      trigger: 'blur'
    }
  ]
}

onMounted(() => {
  form.real_name = userStore.realName || ''
})

async function onSubmit() {
  if (!formRef.value) return
  await formRef.value.validate(async (valid) => {
    if (!valid) return
    loading.value = true
    try {
      await changePassword({ new_password: form.new_password, real_name: form.real_name })
      // 更新本地用户信息：清除强制改密标志
      userStore.setUser({ ...userStore.user, real_name: form.real_name, must_change_password: false })
      ElMessage.success('密码修改成功')
      router.push('/dashboard')
    } catch (e) {
      // 拦截器已提示
    } finally {
      loading.value = false
    }
  })
}
