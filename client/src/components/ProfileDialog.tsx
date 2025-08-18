// import { useState } from "react";
// import { useForm } from "react-hook-form";
// import { zodResolver } from "@hookform/resolvers/zod";
// import { z } from "zod";
// import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
// import { Button } from "@/components/ui/button";
// import { Input } from "@/components/ui/input";
// import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
// import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
// import { Badge } from "@/components/ui/badge";
// import { useToast } from "@/hooks/use-toast";
// import { apiRequest } from "@/lib/queryClient";
// import { Settings, Bell, Lock } from "lucide-react";

// const changePasswordSchema = z.object({
//   currentPassword: z.string().min(1, "請輸入當前密碼"),
//   newPassword: z.string().min(6, "新密碼至少6位數"),
//   confirmPassword: z.string().min(1, "請確認新密碼"),
// }).refine((data) => data.newPassword === data.confirmPassword, {
//   message: "新密碼確認不符",
//   path: ["confirmPassword"],
// });

// type ChangePasswordData = z.infer<typeof changePasswordSchema>;

// interface Notification {
//   id: number;
//   title?: string;
//   message: string;
//   isRead: boolean;
//   createdAt: string;
// }

// interface PointHistoryEntry {
//   id: string;
//   type: "upload" | "use";
//   change: number;
//   description: string;
// }

// interface PointsData {
//   currentPoints: number;
//   history: PointHistoryEntry[];
// }

// export default function Profile() {
//   const { toast } = useToast();
//   const queryClient = useQueryClient();
//   const [showPasswordForm, setShowPasswordForm] = useState(false);

//   const form = useForm<ChangePasswordData>({
//     resolver: zodResolver(changePasswordSchema),
//     defaultValues: {
//       currentPassword: "",
//       newPassword: "",
//       confirmPassword: "",
//     },
//   });

//   // 通知
//   const { data: notifications = [] } = useQuery<Notification[]>({
//     queryKey: ["/api/notifications"],
//   });

//   // 積分
//   const { data: points } = useQuery<PointsData>({
//     queryKey: ["/api/points"],
//   });

//   // 修改密碼
//   const changePasswordMutation = useMutation({
//     mutationFn: async (data: ChangePasswordData) => {
//       const response = await apiRequest("POST", "/api/change-password", data);
//       if (!response.ok) {
//         const err = await response.json().catch(() => ({}));
//         throw new Error(err.message || "更新失敗");
//       }
//       return response.json();
//     },
//     onSuccess: () => {
//       toast({
//         title: "成功",
//         description: "密碼修改成功",
//       });
//       form.reset();
//       setShowPasswordForm(false);
//     },
//     onError: (error: any) => {
//       toast({
//         title: "錯誤",
//         description: error.message || "密碼修改失敗",
//         variant: "destructive",
//       });
//     },
//   });

//   // 標記通知已讀
//   const markAsReadMutation = useMutation({
//     mutationFn: async (notificationId: number) => {
//       await apiRequest("PATCH", `/api/notifications/${notificationId}/read`);
//     },
//     onSuccess: () => {
//       queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
//     },
//   });

//   // 全部標記已讀
//   const markAllAsReadMutation = useMutation({
//     mutationFn: async () => {
//       await apiRequest("PATCH", "/api/notifications/mark-all-read");
//     },
//     onSuccess: () => {
//       queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
//       toast({
//         title: "已讀取所有通知",
//         description: "所有通知已標記為已讀",
//       });
//     },
//     onError: (error: any) => {
//       toast({
//         title: "錯誤",
//         description: error.message || "標記失敗",
//         variant: "destructive",
//       });
//     },
//   });

//   const onSubmit = (data: ChangePasswordData) => {
//     changePasswordMutation.mutate(data);
//   };

//   const unreadCount = Array.isArray(notifications)
//     ? notifications.filter((n) => !n.isRead).length
//     : 0;

//   return (
//     <div className="container mx-auto px-4 py-8 space-y-6 max-w-2xl">
//       <h1 className="text-3xl font-bold">個人資料</h1>

//       {/* 積分區塊 */}
//       <Card>
//         <CardHeader>
//           <CardTitle className="flex items-center gap-2">
//             <Settings className="h-5 w-5" />
//             積分資訊
//           </CardTitle>
//           <CardDescription>
//             查看您目前的積分狀態與最近活動
//           </CardDescription>
//         </CardHeader>
//         <CardContent className="space-y-3">
//           <div className="text-lg font-semibold">
//             剩餘積分：{points?.currentPoints ?? "載入中..."} 點
//           </div>
//           <div className="space-y-2 max-h-40 overflow-y-auto text-sm">
//             {Array.isArray(points?.history) && points.history.length > 0 ? (
//               points.history.map((entry, index) => (
//                 <div
//                   key={entry.id}
//                   className="flex justify-between items-center border-b pb-1"
//                 >
//                   <span>
//                     {index === 0 && "最新一筆異動："}
//                     {entry.type === "upload" && "上傳圖片"}
//                     {entry.type === "use" && (
//                       entry.description === "點擊地圖使用功能" ? "使用地圖功能" :
//                       entry.description === "使用導航功能" ? "使用導航功能" :
//                       entry.description === "使用街景功能" ? "使用街景功能" :
//                       "使用其他功能"
//                     )}
//                   </span>
//                   <span
//                     className={`font-medium ${
//                       entry.change >= 0 ? "text-green-600" : "text-red-600"
//                     }`}
//                   >
//                     {entry.change > 0 ? `+${entry.change}` : entry.change} 點
//                   </span>
//                 </div>
//               ))
//             ) : (
//               <p className="text-muted-foreground">暫無紀錄</p>
//             )}
//           </div>
//         </CardContent>
//       </Card>

//       {/* 密碼修改 */}
//       <Card>
//         <CardHeader>
//           <CardTitle className="flex items-center gap-2">
//             <Lock className="h-5 w-5" />
//             帳號安全
//           </CardTitle>
//           <CardDescription>修改您的登入密碼</CardDescription>
//         </CardHeader>
//         <CardContent>
//           {!showPasswordForm ? (
//             <Button onClick={() => setShowPasswordForm(true)}>
//               修改密碼
//             </Button>
//           ) : (
//             <Form {...form}>
//               <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
//                 <FormField
//                   control={form.control}
//                   name="currentPassword"
//                   render={({ field }) => (
//                     <FormItem>
//                       <FormLabel>當前密碼</FormLabel>
//                       <FormControl>
//                         <Input type="password" {...field} />
//                       </FormControl>
//                       <FormMessage />
//                     </FormItem>
//                   )}
//                 />
//                 <FormField
//                   control={form.control}
//                   name="newPassword"
//                   render={({ field }) => (
//                     <FormItem>
//                       <FormLabel>新密碼</FormLabel>
//                       <FormControl>
//                         <Input type="password" {...field} />
//                       </FormControl>
//                       <FormMessage />
//                     </FormItem>
//                   )}
//                 />
//                 <FormField
//                   control={form.control}
//                   name="confirmPassword"
//                   render={({ field }) => (
//                     <FormItem>
//                       <FormLabel>確認新密碼</FormLabel>
//                       <FormControl>
//                         <Input type="password" {...field} />
//                       </FormControl>
//                       <FormMessage />
//                     </FormItem>
//                   )}
//                 />
//                 <div className="flex gap-2">
//                   <Button type="submit" disabled={changePasswordMutation.isPending}>
//                     {changePasswordMutation.isPending ? "修改中..." : "確認修改"}
//                   </Button>
//                   <Button variant="outline" onClick={() => setShowPasswordForm(false)}>
//                     取消
//                   </Button>
//                 </div>
//               </form>
//             </Form>
//           )}
//         </CardContent>
//       </Card>

//       {/* 通知 */}
//       <Card>
//         <CardHeader>
//           <CardTitle className="flex items-center gap-2">
//             <Bell className="h-5 w-5" />
//             系統通知
//             {unreadCount > 0 && (
//               <Badge variant="destructive">{unreadCount} 未讀</Badge>
//             )}
//           </CardTitle>
//           <CardDescription>查看系統回覆和重要通知</CardDescription>
//         </CardHeader>
//         <CardContent className="space-y-4">
//           {Array.isArray(notifications) && notifications.length > 0 && (
//             <Button
//               variant="outline"
//               onClick={() => markAllAsReadMutation.mutate()}
//             >
//               全部標記已讀
//             </Button>
//           )}
//           <div className="space-y-3 max-h-60 overflow-y-auto">
//             {!Array.isArray(notifications) || notifications.length === 0 ? (
//               <p className="text-muted-foreground text-center py-4">
//                 暫無通知
//               </p>
//             ) : (
//               notifications.map((notification) => (
//                 <div
//                   key={notification.id}
//                   className={`p-3 rounded-lg border ${
//                     notification.isRead
//                       ? "bg-muted/50"
//                       : "bg-blue-50 border-blue-200"
//                   }`}
//                 >
//                   <div className="flex justify-between items-start gap-2">
//                     <div className="flex-1">
//                       <h4 className="font-medium">{notification.title}</h4>
//                       <p className="text-sm text-muted-foreground mt-1">
//                         {notification.message}
//                       </p>
//                     </div>
//                     {!notification.isRead && (
//                       <Button
//                         size="sm"
//                         variant="ghost"
//                         onClick={() => markAsReadMutation.mutate(notification.id)}
//                         disabled={markAsReadMutation.isPending}
//                       >
//                         標記已讀
//                       </Button>
//                     )}
//                   </div>
//                 </div>
//               ))
//             )}
//           </div>
//         </CardContent>
//       </Card>
//     </div>
//   );
// }
