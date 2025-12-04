import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import Navigation from "@/components/Navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Video,
  Users,
  Search,
  Calendar,
  User,
  MapPin,
  Download,
  ArrowLeft,
  Eye,
} from "lucide-react";
import { ImageUpload } from "@shared/schema";

export default function SharedVideos() {
  const [searchTerm, setSearchTerm] = useState("");
  const [sortBy, setSortBy] = useState("newest");
  const [filterUser, setFilterUser] = useState("all");

  const { toast } = useToast();
  const { isAuthenticated, isLoading: authLoading } = useAuth();

  /* ---------- 取得使用者自己的上傳紀錄 ---------- */
  const {
    data: userUploads = [],
    isLoading: uploadsLoading,
  } = useQuery<ImageUpload[]>({
    queryKey: ["/api/uploads"],
    enabled: isAuthenticated,
  });

  /* ---------- 取得所有共享影片（含圖片） ---------- */
  const { data: allVideos = [], isLoading: videosLoading } = useQuery<any[]>({
    queryKey: ["/api/shared-videos"],
    enabled: isAuthenticated && userUploads.length > 0,
  });

  /* ---------- 權限檢查 ---------- */
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      toast({
        title: "請先登入",
        description: "需要登入才能查看共享影片",
        variant: "destructive",
      });
      setTimeout(() => (window.location.href = "/auth"), 500);
    }
  }, [isAuthenticated, authLoading, toast]);

  useEffect(() => {
    if (!uploadsLoading && isAuthenticated && userUploads.length === 0) {
      toast({
        title: "權限不足",
        description: "需要有上傳記錄才能查看他人共享影片",
        variant: "destructive",
      });
      setTimeout(() => (window.location.href = "/upload"), 1000);
    }
  }, [uploadsLoading, isAuthenticated, userUploads.length, toast]);

  /* ---------- 唯一用戶列表 ---------- */
  const uniqueUsers = Array.from(
    new Set(allVideos.map((v: any) => v.username).filter(Boolean))
  );

  /* ---------- 過濾 / 排序 ---------- */
  const filteredVideos = allVideos
    .filter((v: any) => {
      const s = searchTerm.toLowerCase();
      const match =
        v.originalName?.toLowerCase().includes(s) ||
        v.description?.toLowerCase().includes(s) ||
        v.location?.toLowerCase().includes(s);
      const userOk = filterUser === "all" || v.username === filterUser;
      return match && userOk;
    })
    .sort((a: any, b: any) => {
      switch (sortBy) {
        case "newest":
          return +new Date(b.createdAt) - +new Date(a.createdAt);
        case "oldest":
          return +new Date(a.createdAt) - +new Date(b.createdAt);
        case "username":
          return (a.username || "").localeCompare(b.username || "");
        case "filesize":
          return (b.size || 0) - (a.size || 0);
        default:
          return 0;
      }
    });

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  /* ---------- 載入骨架 ---------- */
  if (authLoading || uploadsLoading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navigation />
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          Loading...
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation />

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* -------- Title -------- */}
        <div className="mb-8">
          <div className="flex items-center mb-4">
            <Button variant="ghost" onClick={() => window.history.back()} className="mr-4">
              <ArrowLeft className="h-4 w-4 mr-2" />
              返回
            </Button>
            <h1 className="text-3xl font-bold text-gray-900">
              <Users className="h-8 w-8 text-primary mr-3 inline" />
              社群共享影像
            </h1>
          </div>
          <p className="text-lg text-gray-600">查看社群用戶分享的停車場景影像，取得最新街景及車格資訊</p>
          <div className="mt-4 flex items-center text-sm text-gray-500">
            <Video className="h-4 w-4 mr-2" />
            共 {allVideos.length} 筆檔案
            <Users className="h-4 w-4 ml-4 mr-2" />
            來自 {uniqueUsers.length}0 位用戶
          </div>
        </div>

        {/* -------- 篩選列 -------- */}
        <Card className="mb-8">
          <CardContent className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 h-4 w-4" />
                <Input
                  placeholder="搜尋影片名稱、描述或地點..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>

              <Select value={filterUser} onValueChange={setFilterUser}>
                <SelectTrigger>
                  <SelectValue placeholder="篩選用戶" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">所有用戶</SelectItem>
                  {uniqueUsers.map((u) => (
                    <SelectItem key={u} value={u}>
                      {u}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={sortBy} onValueChange={setSortBy}>
                <SelectTrigger>
                  <SelectValue placeholder="排序方式" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="newest">最新上傳</SelectItem>
                  <SelectItem value="oldest">最舊上傳</SelectItem>
                  <SelectItem value="username">用戶名稱</SelectItem>
                  <SelectItem value="filesize">檔案大小</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* -------- 檔案列表 -------- */}
        {videosLoading ? (
          <div className="text-center py-12">載入共享檔案中...</div>
        ) : filteredVideos.length === 0 ? (
          <div className="text-center py-12">沒有符合條件的檔案</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredVideos.map((file: any) => {
              const isImage = file.mimeType?.startsWith("image/");
              const encoded = encodeURIComponent(file.filename);
              return (
                <Card key={file.id} className="hover:shadow-lg transition-shadow">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <User className="h-4 w-4 text-gray-500" />
                        <span className="text-sm font-medium text-gray-700">
                          {file.username || "匿名用戶"}
                        </span>
                      </div>
                      <Badge variant="outline" className="text-xs">
                        {formatFileSize(file.size || 0)}
                      </Badge>
                    </div>
                  </CardHeader>

                  <CardContent className="space-y-4">
                    {/* ----- Preview 區 ----- */}
                    {isImage ? (
                      <div className="relative bg-gray-100 rounded-lg overflow-hidden">
                        <img
                          src={`/api/uploads/${encoded}`}
                          alt={file.originalName}
                          className="object-cover w-full h-48"
                        />
                        <div className="absolute top-2 right-2">
                          <Badge variant="secondary" className="text-xs">
                            照片
                          </Badge>
                        </div>
                      </div>
                    ) : (
                      <div className="relative bg-gray-100 rounded-lg aspect-video flex items-center justify-center">
                        <Video className="h-12 w-12 text-gray-400" />
                        <div className="absolute top-2 right-2">
                          <Badge variant="secondary" className="text-xs">
                            影片
                          </Badge>
                        </div>
                      </div>
                    )}

                    {/* ----- 資訊 ----- */}
                    <div className="space-y-2">
                      <h3 className="font-medium text-gray-900 line-clamp-1">
                        {file.filename}
                      </h3>

                      {file.location && (
                        <div className="flex items-center text-sm text-gray-600">
                          <MapPin className="h-3 w-3 mr-1" />
                          {file.location}
                        </div>
                      )}

                      {file.description && (
                        <p className="text-sm text-gray-600 line-clamp-2">{file.description}</p>
                      )}

                      <div className="flex items-center text-xs text-gray-500">
                        <Calendar className="h-3 w-3 mr-1" />
                        {new Date(file.createdAt).toLocaleDateString("zh-TW")}
                      </div>
                    </div>

                    {/* ----- Action Buttons ----- */}
                    <div className="flex space-x-2">
                      <Button variant="outline" size="sm" className="flex-1" asChild>
                        <a
                          href={`/api/uploads/${encoded}`}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <Eye className="h-3 w-3 mr-1" />
                          {isImage ? "查看" : "觀看"}
                        </a>
                      </Button>

                      <Button variant="outline" size="sm" asChild>
                        <a
                          href={`/uploads/${encoded}`}
                          download={file.originalName || file.filename}
                        >
                          <Download className="h-3 w-3" />
                        </a>
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}