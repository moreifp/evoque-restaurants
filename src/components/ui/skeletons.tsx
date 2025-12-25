import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";

export function RestaurantCardSkeleton() {
  return (
    <Card className="overflow-hidden">
      <CardContent className="p-6">
        <div className="flex items-start justify-between mb-3">
          <Skeleton className="h-6 w-3/4" />
          <Skeleton className="h-5 w-10" />
        </div>
        <div className="flex items-start gap-2 mb-3">
          <Skeleton className="h-4 w-4 mt-0.5 flex-shrink-0" />
          <Skeleton className="h-4 w-full" />
        </div>
        <Skeleton className="h-4 w-full mb-2" />
        <Skeleton className="h-4 w-2/3 mb-3" />
        <Skeleton className="h-3 w-24" />
      </CardContent>
    </Card>
  );
}

export function AlbumCardSkeleton() {
  return (
    <Card className="overflow-hidden">
      <Skeleton className="aspect-[4/3] w-full" />
      <CardContent className="p-6">
        <Skeleton className="h-6 w-3/4 mb-2" />
        <Skeleton className="h-4 w-full mb-1" />
        <Skeleton className="h-4 w-2/3 mb-3" />
        <Skeleton className="h-3 w-24" />
      </CardContent>
    </Card>
  );
}

export function RestaurantDetailSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Skeleton className="h-10 w-1/3" />
        <div className="flex gap-2">
          <Skeleton className="h-10 w-24" />
          <Skeleton className="h-10 w-24" />
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Skeleton className="aspect-video w-full rounded-lg" />
        <div className="space-y-4">
          <Skeleton className="h-6 w-full" />
          <Skeleton className="h-6 w-3/4" />
          <Skeleton className="h-20 w-full" />
        </div>
      </div>
    </div>
  );
}

export function AgendaCardSkeleton() {
  return (
    <Card className="overflow-hidden">
      <CardContent className="p-4">
        <div className="flex items-start gap-4">
          <Skeleton className="h-12 w-12 rounded-lg" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-5 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-4 w-1/3" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function GridSkeleton({ count = 6, type = "restaurant" }: { count?: number; type?: "restaurant" | "album" | "agenda" }) {
  const SkeletonComponent = type === "album" ? AlbumCardSkeleton : type === "agenda" ? AgendaCardSkeleton : RestaurantCardSkeleton;
  
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonComponent key={i} />
      ))}
    </div>
  );
}
