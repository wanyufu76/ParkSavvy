import { useId } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { ParkingMeter, MapPin, Navigation as NavIcon, Heart, Image as ImageIcon, Upload as UploadIcon, Info, Sparkles, Camera, ChevronRight } from "lucide-react";
import { motion } from "framer-motion";

/**
 * 位無一失｜使用說明彈跳視窗
 * - shadcn/ui + Tailwind + Framer Motion
 * - 將圖片路徑替換為實際截圖：/guide/home.png、/guide/fav-1.png、/guide/fav-2.png、/guide/upload.png
 * - 在父層控制 open/onOpenChange
 */
export default function UsageGuideDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const titleId = useId();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl p-0 overflow-hidden rounded-2xl">
        <DialogHeader className="px-6 pt-6 pb-3">
          <DialogTitle id={titleId} className="text-2xl flex items-center gap-2">
            <Sparkles className="w-5 h-5" /> 位無一失｜使用說明
          </DialogTitle>
          <DialogDescription>專為機車族打造的智慧停車位檢測系統</DialogDescription>
        </DialogHeader>

        {/* 積分說明 */}
        <div className="px-6">
          <Card className="bg-muted/40 border-dashed">
            <CardContent className="py-4">
              <div className="flex flex-wrap items-center gap-3">
                <Badge className="rounded-full px-3 py-1">積分制度</Badge>
                <p className="text-sm text-muted-foreground">
                  使用地圖功能（<span className="inline-flex items-center gap-1"><MapPin className="w-4 h-4" /> 點擊Ｐ點</span>、
                  <span className="inline-flex items-center gap-1"><NavIcon className="w-4 h-4" /> 導航</span>、
                  街景）需要積分。新用戶預設 <b>1000 點</b>；
                  <span className="inline-flex items-center gap-1"><UploadIcon className="w-4 h-4" /> 上傳影像</span> 可獲得相應積分，鼓勵大家踴躍上傳！
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        <Separator className="my-4" />

        {/* 內容分頁 */}
        <div className="px-2 pb-2">
          <Tabs defaultValue="home" className="w-full">
            <div className="px-4 flex items-center justify-between gap-3">
              <TabsList className="grid grid-cols-3 sm:inline-flex sm:gap-2">
                <TabsTrigger value="home" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                  1. 首頁
                </TabsTrigger>
                <TabsTrigger value="fav" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                  2. 我的最愛
                </TabsTrigger>
                <TabsTrigger value="upload" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                  3. 影像上傳
                </TabsTrigger>
              </TabsList>
              <div className="hidden sm:flex items-center gap-2 pr-2 text-xs text-muted-foreground">
                <Info className="w-4 h-4" /> 點選分頁查看操作示意與步驟
              </div>
            </div>

            {/* 首頁 */}
            <TabsContent value="home" className="mt-3">
              <Section>
                <SectionTitle icon={<MapPin className="w-5 h-5" />} title="首頁：查看車格狀況與功能" />
                <ol className="list-decimal pl-5 space-y-2 text-sm leading-6">
                  <li>點擊地圖上的 <b>Ｐ點</b>（停車格標記）可查看詳細車格情況。</li>
                  <li>在車格資訊卡中可使用 <b>街景</b> 或 <b>導航</b> 功能（需消耗積分）。</li>
                  <li>若顯示「需要位置權限」，請允許以獲得更佳導航體驗。</li>
                </ol>
                {/* <GuideImage src="/guide/home.png" alt="首頁功能示意" caption="（圖片）首頁點擊Ｐ點，查看詳細資訊並使用街景/導航" /> */}
              </Section>
            </TabsContent>

            {/* 我的最愛 */}
            <TabsContent value="fav" className="mt-3">
              <Section>
                <SectionTitle icon={<Heart className="w-5 h-5" />} title="我的最愛：快速存取常用車格" />
                <div className="space-y-2 text-sm leading-6">
                  <p>
                    可於 <b>首頁</b>（<i>箭頭</i>）或 <b>列表</b>（<i>箭頭</i>）點擊車格資訊上的
                    <span className="inline-flex items-center gap-1"><Heart className="w-4 h-4" /> 愛心</span> 即可加入「我的最愛」。
                  </p>
                </div>
                <div className="grid sm:grid-cols-2 gap-4">
                  {/* <GuideImage src="/guide/fav-1.png" alt="加入最愛示意" caption="（圖片）在首頁／列表點擊愛心加入我的最愛" />
                  <GuideImage src="/guide/fav-2.png" alt="最愛導航示意" caption="（圖片）在我的最愛啟用位置權限，一鍵導航至最近車格" /> */}
                </div>
                <ul className="mt-3 text-sm text-muted-foreground space-y-1">
                  <li className="flex items-start gap-2"><ChevronRight className="w-4 h-4 mt-0.5" /> 開啟存取位置權限後，可自動計算距離並導航至最近車格。</li>
                  <li className="flex items-start gap-2"><ChevronRight className="w-4 h-4 mt-0.5" /> 最愛列表支援快速查看費率、距離、最後更新時間。</li>
                </ul>
              </Section>
            </TabsContent>

            {/* 影像上傳 */}
            <TabsContent value="upload" className="mt-3">
              <Section>
                <SectionTitle icon={<UploadIcon className="w-5 h-5" />} title="影像上傳：一起更新即時狀態" />
                <ol className="list-decimal pl-5 space-y-2 text-sm leading-6">
                  <li>前往 <b>影像上傳</b> 頁面，選擇相片或使用相機拍攝（建議清晰、水平）。</li>
                  <li>提交後系統會自動辨識車格與車輛，並為你 <b>加回積分</b>（依品質與可用性而定）。</li>
                  <li>上傳越多越即時，大家找車位就越快！</li>
                </ol>
                {/* <GuideImage src="/guide/upload.png" alt="影像上傳示意" caption="（圖片）上傳影像可獲取相應積分，協助更新路邊停車格狀況" /> */}
                <Tip>
                  <Camera className="w-4 h-4" /> 建議：取景包含車格邊界與周圍環境，避免過暗或模糊。
                </Tip>
              </Section>
            </TabsContent>
          </Tabs>
        </div>

        <div className="px-6 pb-5 flex items-center justify-between">
          <div className="text-xs text-muted-foreground flex items-center gap-2">
            <ParkingMeter className="w-4 h-4" /> 小提醒：積分不足時可透過上傳影像補回。
          </div>
          <Button onClick={() => onOpenChange(false)} className="rounded-2xl">我知道了</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* --- 子元件 --- */
function Section({ children }: { children: React.ReactNode }) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="px-6"
    >
      <ScrollArea className="max-h-[54vh] pr-2">
        <div className="space-y-4 pb-2">{children}</div>
      </ScrollArea>
    </motion.section>
  );
}

function SectionTitle({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="p-2 rounded-xl bg-primary/10 text-primary">{icon}</div>
      <h3 className="text-lg font-semibold">{title}</h3>
    </div>
  );
}

function GuideImage({ src, alt, caption }: { src: string; alt: string; caption?: string }) {
  return (
    <figure className="w-full overflow-hidden rounded-xl border bg-background">
      {/* 將 src 改為實際截圖路徑 */}
      <img src={src} alt={alt} className="w-full h-auto object-cover" />
      {caption ? (
        <figcaption className="text-xs text-muted-foreground px-3 py-2 border-t">{caption}</figcaption>
      ) : null}
    </figure>
  );
}

function Tip({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-3 text-xs text-muted-foreground flex items-center gap-2 bg-muted/40 rounded-lg px-3 py-2">
      <Info className="w-4 h-4" /> {children}
    </div>
  );
}
