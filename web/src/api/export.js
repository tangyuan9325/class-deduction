import request from '@/utils/request'

// 导出扣分明细 Excel（返回 blob）
export function exportRecords(params) {
  return request.get('/export/records', {
    params,
    responseType: 'blob'
  })
}

// 通用：把 axios blob 响应保存为文件
export function saveBlob(response, filename) {
  const blob = new Blob([response.data], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  })
  const url = window.URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  window.URL.revokeObjectURL(url)
}

// 从响应头解析文件名
export function parseFilename(response) {
  const disp = response.headers['content-disposition'] || ''
  const m = disp.match(/filename="?([^"]+)?"/)
  return m ? m[1] : 'export.xlsx'
}
