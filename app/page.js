"use client";

import { useState, useEffect } from "react";
import { supabase } from "./supabaseClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { SendIcon, Hash } from "lucide-react";
import Cookies from "js-cookie";
import { motion } from "framer-motion";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Users, Settings, AlertTriangle } from "lucide-react";

// List of allowed admin usernames (emails)
const adminUsers = ["john@example.com", "admin@example.com"];

export default function Page() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [session, setSession] = useState(null);

  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState("");
  const [activeChannel, setActiveChannel] = useState("general");
  const [channels, setChannels] = useState([]);

  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [users, setUsers] = useState([]);

  // Load session from cookies on mount
  useEffect(() => {
    const savedSession = Cookies.get("chat_session");
    if (savedSession) {
      setSession(JSON.parse(savedSession));
    }
  }, []);

  // Fetch channels from the database
  useEffect(() => {
    const fetchChannels = async () => {
      const { data: channelData, error } = await supabase.from("channels").select("*");
      if (error) {
        console.error("Error fetching channels:", error);
        return;
      }
      setChannels(channelData);
    };

    fetchChannels();
  }, []);

  // Fetch maintenance mode state
  const fetchMaintenanceMode = async () => {
    const { data, error } = await supabase
      .from("settings")
      .select("value")
      .eq("key", "maintenance_mode")
      .single();

    if (!error) {
      setMaintenanceMode(data.value);
    }
  };

  // Fetch users data
  const fetchUsers = async () => {
    const { data: usersData, error } = await supabase.from("users").select("*");
    if (!error) {
      setUsers(usersData);
    }
  };

  // Load maintenance mode and users on mount
  useEffect(() => {
    fetchMaintenanceMode();
    fetchUsers();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      if (!email || !password || (!isLogin && !username)) {
        throw new Error("Please fill in all fields");
      }

      if (isLogin) {
        const { data: user, error } = await supabase
          .from("users")
          .select("*")
          .eq("email", email)
          .eq("password", password)
          .single();

        if (error || !user) {
          throw new Error("Invalid credentials");
        }

        Cookies.set("chat_session", JSON.stringify(user), { expires: 30 });
        setSession(user);
      } else {
        const { error: insertError } = await supabase.from("users").insert({
          email,
          password,
          username,
          avatar_url: avatarUrl || "/default-avatar.png",
          badges: JSON.stringify(["New User"]),
        });

        if (insertError) {
          throw insertError;
        }

        const { data: newUser, error: loginError } = await supabase
          .from("users")
          .select("*")
          .eq("email", email)
          .eq("password", password)
          .single();

        if (loginError) {
          throw new Error("Login failed after signup");
        }

        Cookies.set("chat_session", JSON.stringify(newUser), { expires: 30 });
        setSession(newUser);
      }
    } catch (error) {
      setError(error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchMessages = async (channelId) => {
    const { data, error } = await supabase.from("messages").select("*").eq("channel_id", channelId);

    if (!error) setMessages(data);
  };

  useEffect(() => {
    if (!session) return;

    fetchMessages(activeChannel);

    const channel = supabase
      .channel(`messages_channel_${activeChannel}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `channel_id=eq.${activeChannel}` }, (payload) => {
        setMessages((prev) => [...prev, payload.new]);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeChannel, session]);

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!inputMessage.trim()) return;

    try {
      const newMessage = {
        text: inputMessage,
        sender: session.id, // Ensure this is the correct user ID from `users` table
        channel_id: activeChannel,
      };

      const { error } = await supabase.from("messages").insert(newMessage);
      if (error) {
        console.error("Error inserting message:", error.message);
        throw new Error("Failed to send message. Please try again.");
      }

      setInputMessage("");
    } catch (error) {
      console.error("Message sending error:", error.message);
      alert(error.message);
    }
  };

  const isAdmin = session && adminUsers.includes(session.email);
  const isBanned = session && session.status === "Banned";

  const toggleUserStatus = async (userId) => {
    try {
      const user = users.find((u) => u.id === userId);
      if (!user) {
        throw new Error("User not found");
      }

      const newStatus = user.status === "Active" ? "Banned" : "Active";

      const { error } = await supabase.from("users").update({ status: newStatus }).eq("id", userId);

      if (error) {
        throw error;
      }

      setUsers(users.map((u) => (u.id === userId ? { ...u, status: newStatus } : u)));
    } catch (error) {
      console.error("Error toggling user status:", error);
      alert("Failed to update user status.");
    }
  };

  if (maintenanceMode && !isAdmin) {
    return (
      <div className="flex h-screen justify-center items-center">
        <Card className="w-[400px]">
          <CardHeader>
            <CardTitle>Website Under Maintenance</CardTitle>
          </CardHeader>
          <CardContent>
            <p>The website is currently undergoing maintenance. Please check back later.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isBanned) {
    return (
      <div className="flex h-screen justify-center items-center">
        <Card className="w-[400px]">
          <CardHeader>
            <CardTitle>Access Denied</CardTitle>
          </CardHeader>
          <CardContent>
            <p>Your account has been banned. Please contact support if you believe this is a mistake.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!session) {
    return (
      <motion.div initial={{ opacity: 0, y: -50 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
        <Card className="w-[350px] mx-auto mt-10">
          <CardHeader>
            <CardTitle>{isLogin ? "Login" : "Sign Up"}</CardTitle>
            <CardDescription>{isLogin ? "Enter your credentials to login" : "Create a new account"}</CardDescription>
          </CardHeader>
          <form onSubmit={handleSubmit}>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" placeholder="m@example.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
              </div>
              {!isLogin && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="username">Username</Label>
                    <Input id="username" type="text" placeholder="Your username" value={username} onChange={(e) => setUsername(e.target.value)} required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="avatar">Avatar URL (optional)</Label>
                    <Input id="avatar" type="text" placeholder="https://your-avatar-url.com" value={avatarUrl} onChange={(e) => setAvatarUrl(e.target.value)} />
                  </div>
                </>
              )}
              {error && <p className="text-sm text-red-500">{error}</p>}
              <div className="flex items-center space-x-2">
                <Switch id="mode" checked={!isLogin} onCheckedChange={() => setIsLogin(!isLogin)} />
                <Label htmlFor="mode">{isLogin ? "Need an account?" : "Already have an account?"}</Label>
              </div>
            </CardContent>
            <CardFooter>
              <Button className="w-full" type="submit" disabled={isLoading}>
                {isLoading ? "Processing..." : isLogin ? "Login" : "Sign Up"}
              </Button>
            </CardFooter>
          </form>
        </Card>
      </motion.div>
    );
  }

  if (isAdmin) {
    return (
      <div className="container mx-auto p-4">
        <h1 className="text-3xl font-bold mb-6">Admin Panel</h1>

        <Tabs defaultValue="dashboard">
          <TabsList className="mb-4">
            <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
            <TabsTrigger value="users">Users</TabsTrigger>
            <TabsTrigger value="logs">Logs</TabsTrigger>
            <TabsTrigger value="settings">Settings</TabsTrigger>
          </TabsList>

          <TabsContent value="dashboard">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Users</CardTitle>
                  <Users className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{users.length}</div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Active Users</CardTitle>
                  <Users className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{users.filter((user) => user.status === "Active").length}</div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Banned Users</CardTitle>
                  <AlertTriangle className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{users.filter((user) => user.status === "Banned").length}</div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Maintenance Mode</CardTitle>
                  <Settings className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{maintenanceMode ? "On" : "Off"}</div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="users">
            <Card>
              <CardHeader>
                <CardTitle>User Management</CardTitle>
                <CardDescription>Manage your website users here.</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {users.map((user) => (
                      <TableRow key={user.id}>
                        <TableCell>{user.name}</TableCell>
                        <TableCell>{user.email}</TableCell>
                        <TableCell>{user.status}</TableCell>
                        <TableCell>
                          <Button
                            variant={user.status === "Active" ? "destructive" : "default"}
                            onClick={() => toggleUserStatus(user.id)} // Call toggleUserStatus on button click
                          >
                            {user.status === "Active" ? "Ban" : "Unban"}
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="logs">
            <Card>
              <CardHeader>
                <CardTitle>System Logs</CardTitle>
                <CardDescription>View recent system activities and errors.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="bg-muted p-2 rounded">
                    <p className="text-sm">[2023-07-01 10:30:15] User login: john@example.com</p>
                  </div>
                  <div className="bg-muted p-2 rounded">
                    <p className="text-sm">[2023-07-01 11:45:22] Maintenance mode activated</p>
                  </div>
                  <div className="bg-muted p-2 rounded">
                    <p className="text-sm">[2023-07-01 12:15:07] User banned: bob@example.com</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="settings">
            <Card>
              <CardHeader>
                <CardTitle>Website Settings</CardTitle>
                <CardDescription>Manage your website settings here.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between py-2">
                  <div className="space-y-0.5">
                    <h3 className="text-base font-medium">Maintenance Mode</h3>
                    <p className="text-sm text-muted-foreground">Turn on maintenance mode to prevent user access to the website.</p>
                  </div>
                  <Switch
                    checked={maintenanceMode}
                    onCheckedChange={async () => {
                      setMaintenanceMode(!maintenanceMode);
                      const { error } = await supabase.from("settings").update({ value: !maintenanceMode }).eq("key", "maintenance_mode");
                      if (error) {
                        console.error("Error updating maintenance mode:", error.message);
                      }
                    }}
                  />
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    );
  }

  return (
    <div className="flex h-screen">
      <ScrollArea className="h-[calc(100vh-4rem)] w-full max-w-[200px]">
        <div className="space-y-2 p-2">
          {channels.map((channel) => (
            <motion.div key={channel.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4 }}>
              <Button variant={channel.id === activeChannel ? "secondary" : "ghost"} className="w-full justify-start" onClick={() => setActiveChannel(channel.id)}>
                <Hash className="mr-2 h-4 w-4" />
                {channel.name}
              </Button>
            </motion.div>
          ))}
        </div>
      </ScrollArea>

      <Card className="flex-grow flex flex-col">
        <CardHeader>
          <CardTitle>Chat Window - {channels.find((c) => c.id === activeChannel)?.name}</CardTitle>
        </CardHeader>
        <CardContent className="flex-grow overflow-hidden">
          <ScrollArea className="h-full pr-4">
            {messages.map((message, index) => (
              <motion.div
                key={message.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: index * 0.1 }}
                className={`flex ${message.sender === session.id ? "justify-end" : "justify-start"} mb-4`}
              >
                <div className={`flex items-start ${message.sender === session.id ? "flex-row-reverse" : "flex-row"}`}>
                  <Avatar className="w-8 h-8">
                    <AvatarFallback>{message.sender[0]?.toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <div className={`mx-2 p-3 rounded-lg ${message.sender === session.id ? "bg-blue-500 text-white" : "bg-gray-200 text-gray-800"}`}>
                    {message.text}
                  </div>
                </div>
              </motion.div>
            ))}
          </ScrollArea>
        </CardContent>

        <CardFooter>
          <form onSubmit={handleSendMessage} className="flex w-full items-center space-x-2">
            <Input type="text" placeholder="Type your message..." value={inputMessage} onChange={(e) => setInputMessage(e.target.value)} className="flex-grow" />
            <Button type="submit" size="icon">
              <SendIcon className="h-4 w-4" />
              <span className="sr-only">Send message</span>
            </Button>
          </form>
        </CardFooter>
      </Card>
    </div>
  );
}
