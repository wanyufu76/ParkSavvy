import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { adminLoginSchema } from '@shared/schema';
import { z } from 'zod';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Shield, Lock, User } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

type AdminLoginData = z.infer<typeof adminLoginSchema>;

export default function AdminLogin() {
  const [error, setError] = useState<string>("");

  const form = useForm<AdminLoginData>({
    resolver: zodResolver(adminLoginSchema),
    defaultValues: {
      username: "",
      password: "",
    },
  });

  const loginMutation = useMutation({
    mutationFn: async (data: AdminLoginData) => {
      const response = await apiRequest("POST", "/admin/login", data);
      return response.json();
    },
    onSuccess: (data) => {
      // 登入成功後重新導向到管理員面板
      console.log("Admin login successful, redirecting...", data);
      // 稍微延遲跳轉確保會話正確設置
      setTimeout(() => {
        window.location.href = "/admin/dashboard";
      }, 1000);
    },
    onError: (error: any) => {
      setError(error.message || "登入失敗，請檢查帳號密碼");
    },
  });

  const onSubmit = (data: AdminLoginData) => {
    setError("");
    loginMutation.mutate(data);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-green-50 dark:from-gray-900 dark:to-gray-800 p-4">
      <Card className="w-full max-w-md shadow-xl">
        <CardHeader className="text-center space-y-4">
          <div className="mx-auto w-16 h-16 bg-blue-600 rounded-full flex items-center justify-center">
            <Shield className="w-8 h-8 text-white" />
          </div>
          <div>
            <CardTitle className="text-2xl font-bold text-gray-900 dark:text-white">
              管理員登入
            </CardTitle>
            <CardDescription className="text-gray-600 dark:text-gray-400">
              停車格監測系統後台管理
            </CardDescription>
          </div>
        </CardHeader>
        
        <CardContent>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <div className="space-y-2">
              <Label htmlFor="username" className="flex items-center gap-2">
                <User className="w-4 h-4" />
                管理員帳號
              </Label>
              <Input
                id="username"
                type="text"
                placeholder="請輸入管理員帳號"
                {...form.register("username")}
              />
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <User className="h-4 w-4 text-gray-400" />
              </div>
              {form.formState.errors.username && (
                <p className="text-sm text-red-600 dark:text-red-400">
                  {form.formState.errors.username.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="flex items-center gap-2">
                <Lock className="w-4 h-4" />
                密碼
              </Label>
              <Input
                id="password"
                type="password"
                placeholder="請輸入密碼"
                {...form.register("password")}
              />
              {form.formState.errors.password && (
                <p className="text-sm text-red-600 dark:text-red-400">
                  {form.formState.errors.password.message}
                </p>
              )}
            </div>

            <Button
              type="submit"
              className="w-full bg-blue-600 hover:bg-blue-700 text-white"
              disabled={loginMutation.isPending}
            >
              {loginMutation.isPending ? "登入中..." : "登入管理後台"}
            </Button>
          </form>

          <div className="mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
            <div className="text-center text-sm text-gray-600 dark:text-gray-400">
              <p>預設管理員帳號：admin</p>
              <p>預設密碼：admin123456</p>
            </div>
          </div>

          <div className="mt-4 text-center">
            <a
              href="/"
              className="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
            >
              ← 返回首頁
            </a>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}