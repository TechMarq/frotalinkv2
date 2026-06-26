// ============================================================
// Edge Function: manage-user
// Permite criar e atualizar usuários via Supabase Admin API
// sem expor a service_role key no frontend.
//
// Deploy: supabase functions deploy manage-user
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // 1. Verificar autenticação: o chamador deve ser um admin logado
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Não autenticado." }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Criar cliente anon para verificar o usuário chamador
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    // Verificar se o chamador é admin
    const {
      data: { user: callerUser },
      error: callerError,
    } = await callerClient.auth.getUser();
    if (callerError || !callerUser) {
      return new Response(JSON.stringify({ error: "Token inválido." }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verificar role=admin na tabela user_access
    const { data: callerAccess } = await callerClient
      .from("user_access")
      .select("role, empresa_id")
      .eq("email", callerUser.email)
      .eq("active", true)
      .single();

    if (!callerAccess || callerAccess.role !== "admin") {
      return new Response(
        JSON.stringify({ error: "Apenas administradores podem gerenciar usuários." }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // 2. Criar cliente Admin (service_role) para operações privilegiadas
    const adminClient = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const body = await req.json();
    const { action, email, password, nome_completo, role, active, modules, permissions, empresa_id } = body;

    // ── CRIAR USUÁRIO ──────────────────────────────────────────────────
    if (action === "create") {
      if (!email || !password) {
        return new Response(
          JSON.stringify({ error: "E-mail e senha são obrigatórios." }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      // Criar usuário no Auth (Admin API — sem email confirmation)
      const { data: newUser, error: createError } =
        await adminClient.auth.admin.createUser({
          email,
          password,
          email_confirm: true, // Confirmar automaticamente — sem e-mail de verificação
          user_metadata: { nome_completo },
        });

      if (createError) {
        return new Response(JSON.stringify({ error: createError.message }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Inserir na tabela user_access vinculado à empresa do admin
      const empresaId = empresa_id || callerAccess.empresa_id;
      const { error: dbError } = await adminClient.from("user_access").insert([
        {
          email,
          nome_completo: nome_completo || "",
          role: role || "user",
          modules: modules || [],
          permissions: permissions || {},
          active: active !== undefined ? active : true,
          empresa_id: empresaId,
          temp_reset: false,
        },
      ]);

      if (dbError) {
        // Rollback: remover usuário do Auth se falhar no banco
        await adminClient.auth.admin.deleteUser(newUser.user!.id);
        return new Response(JSON.stringify({ error: dbError.message }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(
        JSON.stringify({ success: true, message: "Usuário criado com sucesso." }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // ── ATUALIZAR SENHA ────────────────────────────────────────────────
    if (action === "update_password") {
      if (!email || !password) {
        return new Response(
          JSON.stringify({ error: "E-mail e nova senha são obrigatórios." }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      // Buscar o UUID do usuário pelo e-mail
      const { data: listData, error: listError } =
        await adminClient.auth.admin.listUsers();

      if (listError) {
        return new Response(JSON.stringify({ error: listError.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const targetUser = listData.users.find((u) => u.email === email);
      if (!targetUser) {
        return new Response(
          JSON.stringify({ error: "Usuário não encontrado no sistema de autenticação." }),
          {
            status: 404,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      // Atualizar senha via Admin API
      const { error: updateError } = await adminClient.auth.admin.updateUserById(
        targetUser.id,
        { password }
      );

      if (updateError) {
        return new Response(JSON.stringify({ error: updateError.message }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(
        JSON.stringify({ success: true, message: "Senha atualizada com sucesso." }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // ── DELETAR USUÁRIO DO AUTH ────────────────────────────────────────
    if (action === "delete_auth") {
      if (!email) {
        return new Response(
          JSON.stringify({ error: "E-mail é obrigatório." }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      const { data: listData } = await adminClient.auth.admin.listUsers();
      const targetUser = listData?.users.find((u) => u.email === email);

      if (targetUser) {
        await adminClient.auth.admin.deleteUser(targetUser.id);
      }

      return new Response(
        JSON.stringify({ success: true, message: "Usuário removido do Auth." }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    return new Response(JSON.stringify({ error: "Ação inválida." }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
