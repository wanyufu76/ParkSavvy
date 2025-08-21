import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  ParkingMeter,
  Bot,
  Clock,
  Lock as LockIcon,
  Mail as MailIcon,
  Users as UsersIcon,
  Zap as ZapIcon,
  MonitorSmartphone,
  Map as MapIcon,
} from "lucide-react";
import { useLocation } from "wouter";

export default function Landing() {
  const [, setLocation] = useLocation();
  
  const handleLogin = () => {
    setLocation("/auth");
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <nav className="bg-white shadow-lg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <ParkingMeter className="h-8 w-8 text-primary mr-2" />
              <h1 className="text-2xl font-bold text-primary">位無一失</h1>
            </div>
            <Button onClick={handleLogin} className="bg-primary hover:bg-primary/90">
              登入
            </Button>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <div className="bg-gradient-to-r from-primary to-secondary text-white py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-5xl font-bold mb-6">智慧停車位檢測系統</h2>
          <p className="text-xl text-cyan-100 mb-8 max-w-2xl mx-auto">
            透過AI技術，即時掌握台科大周邊停車位狀況，讓每個停車位都被充分利用
          </p>
          <div className="flex justify-center items-center space-x-8 mb-8">
            <div className="flex items-center">
              <div className="w-4 h-4 bg-success rounded-full mr-2"></div>
              <span>空位</span>
            </div>
            <div className="flex items-center">
              <div className="w-4 h-4 bg-warning rounded-full mr-2"></div>
              <span>有限</span>
            </div>
            <div className="flex items-center">
              <div className="w-4 h-4 bg-error rounded-full mr-2"></div>
              <span>已滿</span>
            </div>
          </div>
          <div className="space-y-4">
            <Button 
              onClick={handleLogin} 
              size="lg" 
              className="bg-white text-primary hover:bg-gray-100 text-lg px-8 py-3"
            >
              立即開始使用
            </Button>
            <div className="text-sm text-cyan-100 max-w-md mx-auto">
              <p className="mb-2">首次使用？點選登入後選擇「註冊新帳戶」</p>
              <p>• 支援Google、GitHub等多種登入方式</p>
              <p>• 密碼需至少6個字元</p>
              <p>• 註冊完成即可立即使用所有功能</p>
            </div>
          </div>
        </div>
      </div>

      {/* Registration Info Section */}
      <div className="py-16 bg-gray-100">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h3 className="text-3xl font-bold text-gray-900 mb-4">如何開始使用？</h3>
            <p className="text-lg text-gray-600">簡單三步驟，立即享受智慧停車服務</p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-12">
            <div className="text-center">
              <div className="w-16 h-16 bg-primary rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-2xl font-bold text-white">1</span>
              </div>
              <h4 className="text-xl font-semibold text-gray-900 mb-2">點擊登入</h4>
              <p className="text-gray-600">點選「登入」按鈕進入驗證頁面</p>
            </div>
            <div className="text-center">
              <div className="w-16 h-16 bg-secondary rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-2xl font-bold text-white">2</span>
              </div>
              <h4 className="text-xl font-semibold text-gray-900 mb-2">選擇註冊方式</h4>
              <p className="text-gray-600">支援Google、GitHub、Email等多種註冊方式</p>
            </div>
            <div className="text-center">
              <div className="w-16 h-16 bg-green-600 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-2xl font-bold text-white">3</span>
              </div>
              <h4 className="text-xl font-semibold text-gray-900 mb-2">立即使用</h4>
              <p className="text-gray-600">註冊完成後即可使用所有停車位查詢功能</p>
            </div>
          </div>
          
          <Card className="max-w-2xl mx-auto">
            <CardContent className="p-6">
              <h4 className="text-lg font-semibold text-gray-900 mb-4 text-center">註冊要求</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex items-start">
                  <LockIcon className="h-4 w-4 text-primary mt-1 mr-3 flex-shrink-0" />
                  <span className="text-gray-600">密碼至少6個字元</span>
                </div>
                <div className="flex items-start">
                  <MailIcon className="h-4 w-4 text-primary mt-1 mr-3 flex-shrink-0" />
                  <span className="text-gray-600">有效的電子信箱</span>
                </div>
                <div className="flex items-start">
                  <UsersIcon className="h-4 w-4 text-primary mt-1 mr-3 flex-shrink-0" />
                  <span className="text-gray-600">支援第三方登入</span>
                </div>
                <div className="flex items-start">
                  <ZapIcon className="h-4 w-4 text-primary mt-1 mr-3 flex-shrink-0" />
                  <span className="text-gray-600">即時驗證註冊</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Features Section */}
      <div className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h3 className="text-4xl font-bold text-gray-900 mb-4">系統特色</h3>
            <p className="text-xl text-gray-600">結合YOLOv8深度學習與即時影像分析技術</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            <Card className="p-6 text-center">
              <CardContent className="pt-6">
                <div className="w-16 h-16 bg-primary rounded-full flex items-center justify-center mx-auto mb-4">
                  <Bot className="h-8 w-8 text-white" />
                </div>
                <h4 className="text-xl font-semibold text-gray-900 mb-2">AI智慧辨識</h4>
                <p className="text-gray-600">YOLOv8模型準確辨識停車位狀態</p>
              </CardContent>
            </Card>
            <Card className="p-6 text-center">
              <CardContent className="pt-6">
                <div className="w-16 h-16 bg-secondary rounded-full flex items-center justify-center mx-auto mb-4">
                  <Clock className="h-8 w-8 text-white" />
                </div>
                <h4 className="text-xl font-semibold text-gray-900 mb-2">即時更新</h4>
                <p className="text-gray-600">停車位資訊即時同步更新</p>
              </CardContent>
            </Card>
            <Card className="p-6 text-center">
            <CardContent className="pt-6">
              {/* 跨裝置支援 */}
              <div className="w-16 h-16 bg-green-600 rounded-full flex items-center justify-center mx-auto mb-4">
                <MonitorSmartphone className="h-8 w-8 text-white" />
              </div>
              <h4 className="text-xl font-semibold text-gray-900 mb-2">跨裝置支援</h4>
              <p className="text-gray-600">手機、平板、電腦都能使用</p>
            </CardContent>
          </Card>

          <Card className="p-6 text-center">
            <CardContent className="pt-6">
              {/* 地圖整合 */}
              <div className="w-16 h-16 bg-yellow-500 rounded-full flex items-center justify-center mx-auto mb-4">
                <MapIcon className="h-8 w-8 text-white" />
              </div>
              <h4 className="text-xl font-semibold text-gray-900 mb-2">地圖整合</h4>
              <p className="text-gray-600">Google Maps無縫整合</p>
            </CardContent>
          </Card>
          </div>
        </div>
      </div>


      {/* Footer */}
      <footer className="bg-gray-900 text-white py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            <div className="col-span-1 md:col-span-2">
              <div className="flex items-center mb-4">
                <ParkingMeter className="h-8 w-8 text-primary mr-3" />
                <h3 className="text-xl font-bold">位無一失</h3>
              </div>
              <p className="text-gray-400 mb-4 max-w-md">
                運用AI技術革新停車體驗，讓每個停車位都被充分利用，為城市交通帶來更多便利。
              </p>
            </div>
            <div>
              <h4 className="text-lg font-semibold mb-4">快速連結</h4>
              <ul className="space-y-2">
                <li><a href="#" className="text-gray-400 hover:text-primary transition-colors duration-200">關於我們</a></li>
                <li><a href="#" className="text-gray-400 hover:text-primary transition-colors duration-200">技術說明</a></li>
                <li><a href="#" className="text-gray-400 hover:text-primary transition-colors duration-200">隱私政策</a></li>
                <li><a href="#" className="text-gray-400 hover:text-primary transition-colors duration-200">使用條款</a></li>
              </ul>
            </div>
            <div>
              <h4 className="text-lg font-semibold mb-4">聯絡資訊</h4>
              <ul className="space-y-2 text-gray-400">
                <li className="flex items-start">
                  <span>國立台灣科技大學</span>
                </li>
                <li className="flex items-start">
                  <span>台北市大安區基隆路四段43號</span>
                </li>
                <li className="flex items-start">
                  <span>contact@parkingai.tw</span>
                </li>
              </ul>
            </div>
          </div>
          <div className="mt-8 pt-8 border-t border-gray-800 text-center text-gray-400">
            <p>&copy; 2024 位無一失. 版權所有 | 國立台灣科技大學專題作品</p>
            <div className="mt-4">
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
