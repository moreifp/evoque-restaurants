import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuthProfile } from "@/hooks/useAuthProfile";
import { Link } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Users,
  UtensilsCrossed,
  Album,
  AlertTriangle,
  ShieldAlert,
  Ban,
  ArrowLeft,
  RefreshCw,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

const ADMIN_EMAILS = ["fausto.moreira@gmail.com"];

interface OverviewData {
  totalUsers: number;
  totalEntries: number;
  totalAlbums: number;
  publicAlbums: number;
  privateAlbums: number;
  pendingReports: number;
  newUsersThisWeek: number;
}

async function adminFetch(action: string, params: Record<string, unknown> = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Not authenticated");

  const res = await supabase.functions.invoke("admin-dashboard", {
    body: { action, ...params },
  });

  if (res.error) throw res.error;
  return res.data;
}

function StatCard({
  title,
  value,
  icon: Icon,
  description,
}: {
  title: string;
  value: string | number;
  icon: React.ElementType;
  description?: string;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {description && (
          <p className="text-xs text-muted-foreground mt-1">{description}</p>
        )}
      </CardContent>
    </Card>
  );
}

// --- Overview Tab ---
function OverviewTab() {
  const [data, setData] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    adminFetch("overview").then(setData).finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="text-muted-foreground p-4">Loading…</p>;
  if (!data) return <p className="text-destructive p-4">Failed to load</p>;

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
      <StatCard title="Users" value={data.totalUsers} icon={Users} description={`+${data.newUsersThisWeek} this week`} />
      <StatCard title="Restaurant Entries" value={data.totalEntries} icon={UtensilsCrossed} />
      <StatCard title="Albums" value={data.totalAlbums} icon={Album} description={`${data.publicAlbums} public · ${data.privateAlbums} private`} />
      <StatCard title="Pending Reports" value={data.pendingReports} icon={ShieldAlert} />
    </div>
  );
}

// --- Reports Tab ---
function ReportsTab() {
  const [reports, setReports] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const { toast } = useToast();

  const load = useCallback(() => {
    setLoading(true);
    adminFetch("reports", { status: filter })
      .then(setReports)
      .finally(() => setLoading(false));
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  const updateStatus = async (reportId: string, status: string) => {
    await adminFetch("update-report", { reportId, status });
    toast({ title: `Report ${status}` });
    load();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="resolved">Resolved</SelectItem>
            <SelectItem value="dismissed">Dismissed</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="ghost" size="icon" onClick={load}>
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {loading ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : reports.length === 0 ? (
        <p className="text-muted-foreground">No reports found.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Reason</TableHead>
              <TableHead>Reporter</TableHead>
              <TableHead>Target</TableHead>
              <TableHead>Details</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {reports.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="text-xs whitespace-nowrap">
                  {format(new Date(r.created_at), "dd/MM/yy HH:mm")}
                </TableCell>
                <TableCell>
                  <Badge
                    variant={
                      r.status === "pending"
                        ? "destructive"
                        : r.status === "resolved"
                        ? "default"
                        : "secondary"
                    }
                  >
                    {r.status}
                  </Badge>
                </TableCell>
                <TableCell className="text-sm">{r.reason}</TableCell>
                <TableCell className="text-sm">{r.reporter_name}</TableCell>
                <TableCell className="text-sm">{r.target_user_name}</TableCell>
                <TableCell className="text-sm max-w-[200px] truncate">
                  {r.details || "—"}
                </TableCell>
                <TableCell>
                  {r.status === "pending" && (
                    <div className="flex gap-1">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => updateStatus(r.id, "resolved")}
                      >
                        Resolve
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => updateStatus(r.id, "dismissed")}
                      >
                        Dismiss
                      </Button>
                    </div>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

// --- Blocks Tab ---
function BlocksTab() {
  const [blocks, setBlocks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    adminFetch("blocks").then(setBlocks).finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="text-muted-foreground p-4">Loading…</p>;

  return blocks.length === 0 ? (
    <p className="text-muted-foreground">No blocks found.</p>
  ) : (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Date</TableHead>
          <TableHead>Blocker</TableHead>
          <TableHead>Blocked</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {blocks.map((b) => (
          <TableRow key={b.id}>
            <TableCell className="text-xs whitespace-nowrap">
              {format(new Date(b.created_at), "dd/MM/yy HH:mm")}
            </TableCell>
            <TableCell>{b.blocker_name}</TableCell>
            <TableCell>{b.blocked_name}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

// --- Errors Tab ---
function ErrorsTab() {
  const [errors, setErrors] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    adminFetch("errors").then(setErrors).finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="text-muted-foreground p-4">Loading…</p>;

  return errors.length === 0 ? (
    <p className="text-muted-foreground">No error logs found.</p>
  ) : (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Date</TableHead>
          <TableHead>Type</TableHead>
          <TableHead>Message</TableHead>
          <TableHead>File</TableHead>
          <TableHead>Platform</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {errors.map((e) => (
          <TableRow key={e.id}>
            <TableCell className="text-xs whitespace-nowrap">
              {format(new Date(e.created_at), "dd/MM/yy HH:mm")}
            </TableCell>
            <TableCell>
              <Badge variant="outline">{e.error_type}</Badge>
            </TableCell>
            <TableCell className="text-sm max-w-[300px] truncate">
              {e.error_message || "—"}
            </TableCell>
            <TableCell className="text-xs">
              {e.file_name ? `${e.file_name} (${e.file_type})` : "—"}
            </TableCell>
            <TableCell className="text-xs">{e.platform || "—"}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

// --- Users Tab ---
function UsersTab() {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    adminFetch("users", { search })
      .then(setUsers)
      .finally(() => setLoading(false));
  }, [search]);

  useEffect(() => {
    const t = setTimeout(load, 300);
    return () => clearTimeout(t);
  }, [load]);

  return (
    <div className="space-y-4">
      <Input
        placeholder="Search by name…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="max-w-sm"
      />
      {loading ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Joined</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((u) => (
              <TableRow key={u.id}>
                <TableCell>{u.display_name || "—"}</TableCell>
                <TableCell className="text-sm">{u.email}</TableCell>
                <TableCell className="text-xs whitespace-nowrap">
                  {u.created_at
                    ? format(new Date(u.created_at), "dd/MM/yy")
                    : "—"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

// --- Main Admin Page ---
export default function Admin() {
  const { session, loading } = useAuthProfile();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Loading…</p>
      </div>
    );
  }

  const email = session?.user?.email ?? "";
  if (!ADMIN_EMAILS.includes(email)) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4">
        <ShieldAlert className="h-12 w-12 text-destructive" />
        <h1 className="text-xl font-semibold">Access Denied</h1>
        <p className="text-muted-foreground">You don't have admin access.</p>
        <Link to="/">
          <Button variant="outline">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Home
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-6xl mx-auto p-4 md:p-6 space-y-6">
        <div className="flex items-center gap-3">
          <Link to="/">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold">Admin Dashboard</h1>
            <p className="text-sm text-muted-foreground">Evoque Management</p>
          </div>
        </div>

        <Tabs defaultValue="overview">
          <TabsList className="w-full flex overflow-x-auto">
            <TabsTrigger value="overview" className="flex-1">Overview</TabsTrigger>
            <TabsTrigger value="reports" className="flex-1">
              Reports
            </TabsTrigger>
            <TabsTrigger value="blocks" className="flex-1">Blocks</TabsTrigger>
            <TabsTrigger value="errors" className="flex-1">Errors</TabsTrigger>
            <TabsTrigger value="users" className="flex-1">Users</TabsTrigger>
          </TabsList>

          <TabsContent value="overview">
            <OverviewTab />
          </TabsContent>
          <TabsContent value="reports">
            <ReportsTab />
          </TabsContent>
          <TabsContent value="blocks">
            <BlocksTab />
          </TabsContent>
          <TabsContent value="errors">
            <ErrorsTab />
          </TabsContent>
          <TabsContent value="users">
            <UsersTab />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
