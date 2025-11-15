import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Wine } from "lucide-react";

const TokenInput = () => {
  const [token, setToken] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!token.trim()) {
      toast.error("Por favor, digite um código");
      return;
    }

    setLoading(true);

    try {
      const { data, error } = await supabase
        .from('share_tokens')
        .select('entry_id, expires_at')
        .eq('token', token.trim().toLowerCase())
        .single();

      if (error || !data) {
        toast.error("Código inválido ou expirado");
        setLoading(false);
        return;
      }

      // Check if token has expired
      if (data.expires_at && new Date(data.expires_at) < new Date()) {
        toast.error("Este código expirou");
        setLoading(false);
        return;
      }

      // Redirect to the shared restaurant page
      navigate(`/share/${data.entry_id}`);

    } catch (error) {
      console.error('Error validating token:', error);
      toast.error("Erro ao validar código");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-subtle flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 w-16 h-16 rounded-lg bg-gradient-olive-teal flex items-center justify-center">
            <Wine className="w-8 h-8 text-white" />
          </div>
          <CardTitle>Digite o Código de Compartilhamento</CardTitle>
          <CardDescription>
            Insira o código de 10 caracteres para ver o restaurante compartilhado
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Input
                type="text"
                placeholder="k3m9p2x7n4"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                maxLength={12}
                className="text-center text-lg tracking-wider uppercase"
                autoFocus
              />
            </div>
            <Button 
              type="submit" 
              className="w-full"
              disabled={loading}
            >
              {loading ? "Verificando..." : "Ver Restaurante"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="w-full"
              onClick={() => navigate("/")}
            >
              Voltar ao Início
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default TokenInput;
