import { ref, reactive } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { User, Lock } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { login } from '@/api/auth'
import { useUserStore } from '@/store/user'

const router = useRouter()
const route = useRoute()
const userStore = useUserStore()

const formRef = ref()
const loading = ref(false)
// remember=true 保持登录（30 天）；false 临时登录（2 小时，关闭浏览器即退出）
const remember = ref(false)
const form = reactive({ username: '', password: '' })
const rules = {
  username: [{ required: true, message: '请输入账号', trigger: 'blur' }],
  password: [{ required: true, message: '请输入密码', trigger: 'blur' }]
}

async function onSubmit() {
  if (!formRef.value) return
  await formRef.value.validate(async (valid) => {
    if (!valid) return
    loading.value = true
    try {
      const data = await login({ username: form.username, password: form.password, remember: remember.value })
      userStore.setToken(data.token, remember.value)
      userStore.setUser(
        {
          user_id: data.user_id,
          username: data.username,
          real_name: data.real_name,
          role: data.role,
          must_change_password: !!data.must_change_password
        },
        remember.value
      )
      ElMessage.success('登录成功')
      // 首次登录强制修改密码
      if (data.must_change_password) {
        router.push('/change-password')
        return
      }
      const redirect = route.query.redirect || '/dashboard'
      router.push(redirect)
    } catch (e) {
      // 拦截器已提示
    } finally {
      loading.value = false
    }
  })
}
