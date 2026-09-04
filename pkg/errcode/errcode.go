package errcode

import "net/http"

// AppError 应用错误，包含错误码、提示信息与对应的 HTTP 状态码
type AppError struct {
	Code       int
	Message    string
	HTTPStatus int
}

func (e *AppError) Error() string { return e.Message }

// AsApp 将任意 error 转换为 *AppError。
// 如果已经是 *AppError 则原样返回，否则视为内部错误。
func AsApp(err error) *AppError {
	if err == nil {
		return nil
	}
	if ae, ok := err.(*AppError); ok {
		return ae
	}
	return ErrInternal
}

// New 构造一个业务错误
func New(code int, msg string, httpStatus int) *AppError {
	return &AppError{Code: code, Message: msg, HTTPStatus: httpStatus}
}

// 预定义错误码
var (
	// 通用错误 (10xxx)
	ErrInternal     = New(10000, "服务器内部错误", http.StatusInternalServerError)
	ErrBadRequest   = New(10001, "请求参数错误", http.StatusBadRequest)
	ErrUnauthorized = New(10002, "未授权或登录已过期", http.StatusUnauthorized)
	ErrForbidden    = New(10003, "权限不足", http.StatusForbidden)
	ErrNotFound     = New(10004, "资源不存在", http.StatusNotFound)

	// 认证模块 (20xxx)
	ErrUserNotFound  = New(20001, "用户不存在", http.StatusBadRequest)
	ErrPasswordWrong = New(20002, "账号或密码错误", http.StatusBadRequest)
	ErrTokenInvalid  = New(20003, "Token 无效", http.StatusUnauthorized)
	ErrTokenExpired  = New(20004, "Token 已过期", http.StatusUnauthorized)

	// 扣分记录模块 (30xxx)
	ErrRecordNotFound = New(30001, "扣分记录不存在", http.StatusNotFound)
	ErrNoTargetUser   = New(30002, "缺少目标学生", http.StatusBadRequest)
	ErrCategoryEmpty  = New(30003, "扣分类别不能为空", http.StatusBadRequest)

	// 用户管理模块 (40xxx)
	ErrUserExists       = New(40001, "账号已存在", http.StatusBadRequest)
	ErrSamePassword     = New(40002, "新密码不能与原密码相同", http.StatusBadRequest)
	ErrCannotDeleteSelf = New(40003, "不能删除当前登录账号", http.StatusBadRequest)
)
