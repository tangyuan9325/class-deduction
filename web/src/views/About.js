import { ref, computed, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { CopyDocument } from '@element-plus/icons-vue'
import { getMeta } from '@/api/meta'
import { useUserStore } from '@/store/user'

const userStore = useUserStore()
const meta = ref(null)

const cloneCmd = computed(() => meta.value?.clone_command || 'git clone https://github.com/tangyuan9325/class-deduction')

const accounts = [
  { role: '管理员', username: 'admin', password: 'admin123', desc: '全部权限' },
  { role: '班主任', username: 'banzhuren', password: '123456', desc: '全部权限，默认姓名崔孝禹' },
  { role: '班级看板', username: 'kandban', password: '123456', desc: '只读看板账号，无任何权限（1.1.0 新增）' },
  { role: '学生', username: 'stu+学号', password: '123456', desc: '首次登录需修改密码' }
]

function copyClone() {
  try {
    navigator.clipboard.writeText(cloneCmd.value)
    ElMessage.success('克隆命令已复制')
  } catch (e) {
    ElMessage.error('复制失败，请手动选择复制')
  }
}

onMounted(async () => {
  try {
    const res = await getMeta()
    meta.value = res
    userStore.setMeta(res)
  } catch (e) {
    // 忽略
  }
})
