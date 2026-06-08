# UI 基礎組件庫

此目錄包含所有可複用的基礎 UI 組件。

## 📦 組件清單

### 按鈕
- **Button** (`buttons/Button.tsx`)
  - 變體：primary | secondary | danger
  - 尺寸：sm | md | lg
  - 支援 loading 和 disabled 狀態

### 卡片
- **Card** (`cards/Card.tsx`)
  - CardHeader - 頭部區域
  - CardBody - 主要內容
  - CardFooter - 底部區域

### 表單
- **FormField** (`forms/FormField.tsx`) - 表單字段容器
- **Input** (`forms/Input.tsx`) - 文本輸入框
- **Select** (`forms/Select.tsx`) - 下拉選擇
- **Checkbox** (`forms/Checkbox.tsx`) - 複選框

### 反饋
- **Alert** (`feedback/Alert.tsx`) - 警告提示
- **Badge** (`feedback/Badge.tsx`) - 標籤/徽章

### 模態框
- **Modal** (`modals/Modal.tsx`) - 模態框

### 佈局
- **PageHeader** (`layout/PageHeader.tsx`) - 頁面頭部

## 🚀 快速使用

```tsx
import Button from '@/components/ui/buttons/Button'
import { Card, CardHeader, CardBody, CardFooter } from '@/components/ui/cards/Card'
import FormField from '@/components/ui/forms/FormField'
import Input from '@/components/ui/forms/Input'
import Select from '@/components/ui/forms/Select'
import Checkbox from '@/components/ui/forms/Checkbox'
import Alert from '@/components/ui/feedback/Alert'
import Badge from '@/components/ui/feedback/Badge'
import Modal from '@/components/ui/modals/Modal'
import PageHeader from '@/components/ui/layout/PageHeader'
```

## 📖 組件文檔

詳見各組件文件中的 JSDoc 註釋和使用示例。

更多詳細信息請參考根目錄的 `COMPONENT_LIBRARY.md`。
