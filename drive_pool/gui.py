"""
Interface Gráfica Desktop Moderna para o Google Drive Virtual Pool.
Suporta CustomTkinter (design escuro moderno) com fallback automático
para Tkinter padrão com ttk caso CustomTkinter não esteja instalado.
"""

import sys
import os
import threading
from typing import Optional, List, Dict, Any

from .pool_manager import VirtualPoolManager, InsufficientPoolSpaceError
from .storage import format_bytes

# Tenta importar CustomTkinter; se não estiver presente, usa Tkinter padrão
try:
    import customtkinter as ctk
    USE_CTK = True
    ctk.set_appearance_mode("Dark")
    ctk.set_default_color_theme("blue")
except ImportError:
    USE_CTK = False
    import tkinter as ctk  # Fallback
    import tkinter.ttk as ttk
    from tkinter import messagebox, filedialog


if USE_CTK:
    import tkinter.filedialog as filedialog
    import tkinter.messagebox as messagebox


class DrivePoolDesktopApp:
    """
    Aplicação Desktop para gerenciamento visual do Virtual Storage Pool.
    """

    def __init__(self, root: Any):
        self.root = root
        self.manager = VirtualPoolManager()
        self.files_cache: List[Dict[str, Any]] = []
        self.active_watcher = None
        self.watcher_thread = None

        self._setup_window()
        self._build_ui()
        self.refresh_all_async()

    def _setup_window(self):
        """Configurações da janela principal."""
        self.root.title("Google Drive Virtual Storage Pool - 30 GB+")
        self.root.geometry("980x680")
        self.root.minsize(860, 560)

    def _build_ui(self):
        """Constrói a interface moderna."""
        if USE_CTK:
            self._build_ctk_ui()
        else:
            self._build_standard_tk_ui()

    # -------------------------------------------------------------
    # Implementação Moderna em CustomTkinter
    # -------------------------------------------------------------
    def _build_ctk_ui(self):
        # Container Principal
        self.main_container = ctk.CTkFrame(self.root, corner_radius=0, fg_color="#0f172a")
        self.main_container.pack(fill="both", expand=True, padx=0, pady=0)

        # 1. Header
        header_frame = ctk.CTkFrame(self.main_container, fg_color="#1e293b", corner_radius=12)
        header_frame.pack(fill="x", padx=16, pady=(16, 8))

        title_box = ctk.CTkFrame(header_frame, fg_color="transparent")
        title_box.pack(side="left", padx=16, pady=12)

        lbl_title = ctk.CTkLabel(
            title_box,
            text="Google Drive Virtual Storage Pool",
            font=ctk.CTkFont(size=20, weight="bold"),
            text_color="#38bdf8"
        )
        lbl_title.pack(anchor="w")

        lbl_sub = ctk.CTkLabel(
            title_box,
            text="Capacidade Unificada Multi-Conta • Alocação Inteligente MFS (Most Free Space)",
            font=ctk.CTkFont(size=12),
            text_color="#94a3b8"
        )
        lbl_sub.pack(anchor="w")

        # Botões de Ação no topo direito (Programas, Pastas & Contas)
        btn_box = ctk.CTkFrame(header_frame, fg_color="transparent")
        btn_box.pack(side="right", padx=16, pady=12)

        self.btn_auth = ctk.CTkButton(
            btn_box,
            text="⚙ Conectar Contas",
            command=self.open_auth_dialog,
            fg_color="#334155",
            hover_color="#475569",
            width=130
        )
        self.btn_auth.pack(side="right", padx=4)

        self.btn_sync = ctk.CTkButton(
            btn_box,
            text="📁 Pastas Auto-Sync",
            command=self.open_sync_folders_dialog,
            fg_color="#059669",
            hover_color="#047857",
            width=145
        )
        self.btn_sync.pack(side="right", padx=4)

        self.btn_programs = ctk.CTkButton(
            btn_box,
            text="🚀 Programas no Drive",
            command=self.open_programs_dialog,
            fg_color="#0284c7",
            hover_color="#0369a1",
            width=160
        )
        self.btn_programs.pack(side="right", padx=4)

        # 2. Painel de Capacidade do Pool (Card Superior)
        self.pool_card = ctk.CTkFrame(self.main_container, fg_color="#1e293b", corner_radius=12)
        self.pool_card.pack(fill="x", padx=16, pady=8)

        # Título do Card e Métricas
        metrics_frame = ctk.CTkFrame(self.pool_card, fg_color="transparent")
        metrics_frame.pack(fill="x", padx=16, pady=(12, 6))

        self.lbl_pool_title = ctk.CTkLabel(
            metrics_frame,
            text="CAPACIDADE TOTAL DO POOL UNIFICADO",
            font=ctk.CTkFont(size=13, weight="bold"),
            text_color="#cbd5e1"
        )
        self.lbl_pool_title.pack(side="left")

        self.lbl_pool_numbers = ctk.CTkLabel(
            metrics_frame,
            text="Carregando cotas...",
            font=ctk.CTkFont(size=13, weight="bold"),
            text_color="#38bdf8"
        )
        self.lbl_pool_numbers.pack(side="right")

        # Barra de Progresso do Pool Total
        self.pool_progress = ctk.CTkProgressBar(self.pool_card, height=14, corner_radius=7)
        self.pool_progress.set(0)
        self.pool_progress.configure(progress_color="#0284c7")
        self.pool_progress.pack(fill="x", padx=16, pady=(0, 10))

        # Container Dinâmico para N Contas do Pool
        self.drives_container = ctk.CTkFrame(self.pool_card, fg_color="transparent")
        self.drives_container.pack(fill="x", padx=16, pady=(0, 12))

        # 3. Barra de Ações & Busca
        toolbar = ctk.CTkFrame(self.main_container, fg_color="transparent")
        toolbar.pack(fill="x", padx=16, pady=6)

        self.btn_upload = ctk.CTkButton(
            toolbar,
            text="⬆ Enviar Arquivo (MFS)",
            command=self.action_upload,
            fg_color="#0284c7",
            hover_color="#0369a1",
            font=ctk.CTkFont(weight="bold")
        )
        self.btn_upload.pack(side="left", padx=(0, 8))

        self.btn_download = ctk.CTkButton(
            toolbar,
            text="⬇ Baixar Selecionado",
            command=self.action_download,
            fg_color="#10b981",
            hover_color="#059669",
            font=ctk.CTkFont(weight="bold")
        )
        self.btn_download.pack(side="left", padx=(0, 8))

        self.btn_delete = ctk.CTkButton(
            toolbar,
            text="🗑 Excluir",
            command=self.action_delete,
            fg_color="#ef4444",
            hover_color="#dc2626",
            width=90
        )
        self.btn_delete.pack(side="left", padx=(0, 8))

        self.btn_refresh = ctk.CTkButton(
            toolbar,
            text="🔄 Atualizar",
            command=self.refresh_all_async,
            fg_color="#334155",
            hover_color="#475569",
            width=90
        )
        self.btn_refresh.pack(side="left", padx=(0, 8))

        # Campo de busca
        self.entry_search = ctk.CTkEntry(
            toolbar,
            placeholder_text="🔍 Filtrar arquivos...",
            width=200
        )
        self.entry_search.pack(side="right")
        self.entry_search.bind("<KeyRelease>", self._on_search_change)

        # 4. Tabela de Arquivos do Catálogo (Usando Treeview padrão com estilo escuro)
        table_frame = ctk.CTkFrame(self.main_container, fg_color="#1e293b", corner_radius=12)
        table_frame.pack(fill="both", expand=True, padx=16, pady=8)

        # Usamos ttk.Treeview para dados tabulares ricos com scrollbar
        self._setup_treeview(table_frame)

        # 5. Barra Inferior de Status & Progresso em Tempo Real
        self.status_bar = ctk.CTkFrame(self.main_container, fg_color="#0f172a", height=38)
        self.status_bar.pack(fill="x", side="bottom", padx=16, pady=(4, 12))

        self.lbl_status = ctk.CTkLabel(
            self.status_bar,
            text="Pronto",
            font=ctk.CTkFont(size=12),
            text_color="#94a3b8"
        )
        self.lbl_status.pack(side="left", padx=8)

        self.op_progress = ctk.CTkProgressBar(self.status_bar, height=10, width=220)
        self.op_progress.set(0)
        self.op_progress.pack(side="right", padx=8)

    # -------------------------------------------------------------
    # Fallback para Tkinter Padrão caso CustomTkinter não esteja instalado
    # -------------------------------------------------------------
    def _build_standard_tk_ui(self):
        import tkinter as tk
        from tkinter import ttk

        style = ttk.Style()
        try:
            style.theme_use("clam")
        except Exception:
            pass

        self.main_container = tk.Frame(self.root, bg="#0f172a")
        self.main_container.pack(fill="both", expand=True)

        header = tk.Frame(self.main_container, bg="#1e293b", padx=16, pady=12)
        header.pack(fill="x", padx=12, pady=8)

        header_top = tk.Frame(header, bg="#1e293b")
        header_top.pack(fill="x")

        tk.Label(
            header_top,
            text="Google Drive Virtual Storage Pool",
            font=("Arial", 16, "bold"),
            fg="#38bdf8",
            bg="#1e293b"
        ).pack(side="left")

        tk.Button(
            header_top,
            text="⚙ Conectar Contas",
            bg="#334155",
            fg="white",
            font=("Arial", 9, "bold"),
            command=self.open_auth_dialog
        ).pack(side="right", padx=(4, 0))

        tk.Button(
            header_top,
            text="📁 Pastas Auto-Sync",
            bg="#059669",
            fg="white",
            font=("Arial", 9, "bold"),
            command=self.open_sync_folders_dialog
        ).pack(side="right", padx=4)

        tk.Button(
            header_top,
            text="🚀 Programas no Drive",
            bg="#0284c7",
            fg="white",
            font=("Arial", 9, "bold"),
            command=self.open_programs_dialog
        ).pack(side="right", padx=4)

        tk.Label(
            header,
            text="Capacidade Unificada Multi-Conta • Alocação MFS",
            font=("Arial", 10),
            fg="#94a3b8",
            bg="#1e293b"
        ).pack(anchor="w")

        # Pool Card
        self.pool_card = tk.Frame(self.main_container, bg="#1e293b", padx=14, pady=10)
        self.pool_card.pack(fill="x", padx=12, pady=6)

        self.lbl_pool_title = tk.Label(
            self.pool_card,
            text="CAPACIDADE TOTAL DO POOL UNIFICADO",
            fg="#cbd5e1",
            bg="#1e293b",
            font=("Arial", 10, "bold")
        )
        self.lbl_pool_title.pack(anchor="w")

        self.lbl_pool_numbers = tk.Label(
            self.pool_card,
            text="Carregando cotas...",
            fg="#38bdf8",
            bg="#1e293b",
            font=("Arial", 11, "bold")
        )
        self.lbl_pool_numbers.pack(anchor="w", pady=(0, 6))

        self.pool_progress = ttk.Progressbar(self.pool_card, orient="horizontal", mode="determinate")
        self.pool_progress.pack(fill="x", pady=(0, 6))

        self.drives_container = tk.Frame(self.pool_card, bg="#1e293b")
        self.drives_container.pack(fill="x", pady=(0, 4))

        # Toolbar
        toolbar = tk.Frame(self.main_container, bg="#0f172a")
        toolbar.pack(fill="x", padx=12, pady=6)

        tk.Button(toolbar, text="⬆ Enviar Arquivo", bg="#0284c7", fg="white", command=self.action_upload).pack(side="left", padx=4)
        tk.Button(toolbar, text="⬇ Baixar", bg="#10b981", fg="white", command=self.action_download).pack(side="left", padx=4)
        tk.Button(toolbar, text="🗑 Excluir", bg="#ef4444", fg="white", command=self.action_delete).pack(side="left", padx=4)
        tk.Button(toolbar, text="🔄 Atualizar", bg="#334155", fg="white", command=self.refresh_all_async).pack(side="left", padx=4)

        table_frame = tk.Frame(self.main_container, bg="#1e293b")
        table_frame.pack(fill="both", expand=True, padx=12, pady=6)
        self._setup_treeview(table_frame)

        # Status Bar
        self.lbl_status = tk.Label(self.main_container, text="Pronto", fg="#94a3b8", bg="#0f172a")
        self.lbl_status.pack(side="left", padx=12, pady=6)

    def _setup_treeview(self, parent: Any):
        """Configura a tabela visual de arquivos indexados."""
        import tkinter as tk
        import tkinter.ttk as ttk

        # Configura estilo escuro para a tabela
        style = ttk.Style()
        style.configure(
            "Treeview",
            background="#0f172a",
            foreground="#f8fafc",
            fieldbackground="#0f172a",
            rowheight=28,
            font=("Arial", 10)
        )
        style.configure("Treeview.Heading", font=("Arial", 10, "bold"), background="#334155", foreground="#38bdf8")
        style.map("Treeview", background=[("selected", "#0284c7")])

        cols = ("id", "nome", "tamanho", "conta", "md5", "data")
        self.tree = ttk.Treeview(parent, columns=cols, show="headings", selectmode="browse")

        self.tree.heading("id", text="ID")
        self.tree.heading("nome", text="Nome do Arquivo")
        self.tree.heading("tamanho", text="Tamanho")
        self.tree.heading("conta", text="Conta Origem")
        self.tree.heading("md5", text="Hash MD5")
        self.tree.heading("data", text="Data Upload")

        self.tree.column("id", width=45, anchor="center")
        self.tree.column("nome", width=260, anchor="w")
        self.tree.column("tamanho", width=95, anchor="e")
        self.tree.column("conta", width=105, anchor="center")
        self.tree.column("md5", width=180, anchor="center")
        self.tree.column("data", width=140, anchor="center")

        scrollbar = ttk.Scrollbar(parent, orient="vertical", command=self.tree.yview)
        self.tree.configure(yscrollcommand=scrollbar.set)

        self.tree.pack(side="left", fill="both", expand=True, padx=(8, 0), pady=8)
        scrollbar.pack(side="right", fill="y", padx=(0, 8), pady=8)

    # -------------------------------------------------------------
    # Operações Assíncronas (Threads para não travar a UI)
    # -------------------------------------------------------------
    def set_status(self, text: str, progress: float = 0.0):
        """Atualiza a barra de status thread-safe."""
        def _update():
            if hasattr(self, "lbl_status"):
                self.lbl_status.configure(text=text) if USE_CTK else self.lbl_status.config(text=text)
            if hasattr(self, "op_progress"):
                if USE_CTK:
                    self.op_progress.set(progress / 100.0)
                else:
                    self.op_progress["value"] = progress
        self.root.after(0, _update)

    def refresh_all_async(self):
        """Dispara atualização em segundo plano."""
        threading.Thread(target=self._worker_refresh, daemon=True).start()

    def _worker_refresh(self):
        self.set_status("Consultando cotas da Google Drive API...", 10)
        try:
            status = self.manager.get_pool_status(interactive=False)
            files = self.manager.list_files()
            self.files_cache = files

            def _update_ui():
                self._update_pool_display(status)
                self._populate_table(files)
                self.set_status(f"Pronto • {len(files)} arquivos indexados no SQLite.", 0)

            self.root.after(0, _update_ui)
        except Exception as e:
            self.set_status(f"Erro ao sincronizar: {e}", 0)

    def _update_pool_display(self, status: Dict[str, Any]):
        """Atualiza os indicadores do pool e das contas na UI."""
        limit_b = status["total_limit_bytes"]
        usage_b = status["total_usage_bytes"]
        free_b = status["total_free_bytes"]
        pct = status["percent_used"]

        txt = (
            f"Ocupado: {format_bytes(usage_b)} ({pct}%)  •  "
            f"Livre: {format_bytes(free_b)}  •  "
            f"Total: {format_bytes(limit_b)}"
        )
        if USE_CTK:
            self.lbl_pool_numbers.configure(text=txt)
            self.pool_progress.set(pct / 100.0 if limit_b > 0 else 0)
        else:
            self.lbl_pool_numbers.config(text=txt)
            self.pool_progress["value"] = pct

        # Atualiza título com número de contas
        accounts = status["accounts"]
        total_accs = len(accounts)
        title_text = f"CAPACIDADE TOTAL DO POOL ({total_accs} CONTAS UNIFICADAS)"
        if USE_CTK:
            self.lbl_pool_title.configure(text=title_text)
        elif hasattr(self, "lbl_pool_title"):
            self.lbl_pool_title.config(text=title_text)

        # Atualiza dinamicamente os cartões de cada conta no container
        if hasattr(self, "drives_container"):
            for child in self.drives_container.winfo_children():
                child.destroy()

            colors = ["#06b6d4", "#f59e0b", "#10b981", "#8b5cf6", "#ec4899", "#3b82f6"]

            for idx, (acc_id, acc_info) in enumerate(accounts.items()):
                acc_color = colors[idx % len(colors)]
                if USE_CTK:
                    box = ctk.CTkFrame(self.drives_container, fg_color="#0f172a", corner_radius=8)
                    box.pack(side="left", fill="x", expand=True, padx=4, pady=2)

                    lbl_title = ctk.CTkLabel(
                        box,
                        text=f"{acc_id.upper()}",
                        font=ctk.CTkFont(weight="bold", size=12),
                        text_color=acc_color
                    )
                    lbl_title.pack(anchor="w", padx=10, pady=(6, 2))

                    if acc_info.get("authenticated") and acc_info.get("quota"):
                        q = acc_info["quota"]
                        user_info = f" • {q['user_email']}" if q.get("user_email") and q["user_email"] != "N/A" else ""
                        info_txt = f"{q['formatted_usage']} / {q['formatted_limit']}\n(Livre: {q['formatted_free']}){user_info}"
                        progress_val = q["percent_used"] / 100.0
                    else:
                        info_txt = f"Não autenticado\n(requer token_{acc_id}.json)"
                        progress_val = 0.0

                    lbl_info = ctk.CTkLabel(box, text=info_txt, text_color="#94a3b8", font=ctk.CTkFont(size=10), justify="left")
                    lbl_info.pack(anchor="w", padx=10, pady=(0, 4))

                    prog = ctk.CTkProgressBar(box, height=8)
                    prog.set(progress_val)
                    prog.configure(progress_color=acc_color)
                    prog.pack(fill="x", padx=10, pady=(0, 8))
                else:
                    import tkinter as tk
                    from tkinter import ttk
                    box = tk.Frame(self.drives_container, bg="#0f172a", padx=8, pady=6)
                    box.pack(side="left", fill="x", expand=True, padx=4, pady=2)

                    tk.Label(box, text=acc_id.upper(), font=("Arial", 10, "bold"), fg=acc_color, bg="#0f172a").pack(anchor="w")

                    if acc_info.get("authenticated") and acc_info.get("quota"):
                        q = acc_info["quota"]
                        txt = f"{q['formatted_usage']} / {q['formatted_limit']} (Livre: {q['formatted_free']})"
                        p_val = q["percent_used"]
                    else:
                        txt = "Não autenticado"
                        p_val = 0

                    tk.Label(box, text=txt, font=("Arial", 9), fg="#94a3b8", bg="#0f172a").pack(anchor="w")
                    p = ttk.Progressbar(box, orient="horizontal", mode="determinate")
                    p["value"] = p_val
                    p.pack(fill="x", pady=2)

    def _populate_table(self, files: List[Dict[str, Any]]):
        """Preenche o Treeview com a lista de arquivos filtrados."""
        for item in self.tree.get_children():
            self.tree.delete(item)

        for f in files:
            self.tree.insert(
                "",
                "end",
                values=(
                    f["id"],
                    f["nome_arquivo"],
                    f.get("tamanho_formatado", format_bytes(f["tamanho_bytes"])),
                    f["conta_origem"].upper(),
                    f["md5_hash"][:16] + "...",
                    f["data_upload"][:19].replace("T", " ")
                )
            )

    def _on_search_change(self, event=None):
        query = self.entry_search.get().strip().lower()
        if not query:
            self._populate_table(self.files_cache)
        else:
            filtered = [f for f in self.files_cache if query in f["nome_arquivo"].lower()]
            self._populate_table(filtered)

    # -------------------------------------------------------------
    # Ações do Usuário (Upload, Download, Delete, Auth)
    # -------------------------------------------------------------
    def action_upload(self):
        """Seleciona arquivo local e envia com MFS."""
        file_path = filedialog.askopenfilename(title="Selecione o arquivo para envio ao Virtual Pool")
        if not file_path:
            return

        def _worker():
            def on_progress(cur, total, pct):
                self.set_status(f"Enviando chunks ({pct:.1f}%)... {format_bytes(cur)}/{format_bytes(total)}", pct)

            try:
                self.set_status("Verificando cotas MFS e calculando MD5...", 5)
                res = self.manager.upload_file(file_path, progress_callback=on_progress)
                acc = res["allocated_account"].upper()
                self.set_status(f"✔ Upload concluído na conta {acc}!", 100)
                messagebox.showinfo(
                    "Upload com Sucesso",
                    f"O arquivo foi enviado com sucesso!\n\n"
                    f"• Conta selecionada pelo MFS: {acc}\n"
                    f"• ID SQLite: {res['record']['id']}\n"
                    f"• Hash MD5: {res['record']['md5_hash']}"
                )
                self.refresh_all_async()
            except InsufficientPoolSpaceError as e:
                self.set_status("Espaço insuficiente no Pool", 0)
                messagebox.showerror("Capacidade Insuficiente", str(e))
            except Exception as e:
                self.set_status(f"Falha no upload: {e}", 0)
                messagebox.showerror("Erro de Upload", f"Não foi possível enviar o arquivo:\n{e}")

        threading.Thread(target=_worker, daemon=True).start()

    def action_download(self):
        """Baixa o arquivo selecionado na tabela."""
        selected = self.tree.selection()
        if not selected:
            messagebox.showwarning("Seleção", "Por favor, selecione um arquivo na tabela primeiro.")
            return

        item = self.tree.item(selected[0])
        file_id = str(item["values"][0])
        filename = str(item["values"][1])

        dest_folder = filedialog.askdirectory(title=f"Escolha a pasta de destino para: {filename}")
        if not dest_folder:
            return

        def _worker():
            def on_dl_progress(cur, total, pct):
                self.set_status(f"Baixando chunks ({pct:.1f}%)... {format_bytes(cur)}/{format_bytes(total)}", pct)

            try:
                self.set_status("Iniciando download streaming...", 5)
                record, saved = self.manager.download_file(file_id, dest_folder, progress_callback=on_dl_progress)
                self.set_status(f"✔ Download concluído: {record['nome_arquivo']}", 100)
                messagebox.showinfo("Download Concluído", f"Arquivo salvo com sucesso em:\n{saved}")
            except Exception as e:
                self.set_status(f"Erro no download: {e}", 0)
                messagebox.showerror("Erro de Download", str(e))

        threading.Thread(target=_worker, daemon=True).start()

    def action_delete(self):
        """Exclui o arquivo selecionado."""
        selected = self.tree.selection()
        if not selected:
            messagebox.showwarning("Seleção", "Selecione um arquivo para excluir.")
            return

        item = self.tree.item(selected[0])
        file_id = str(item["values"][0])
        filename = str(item["values"][1])
        conta = str(item["values"][3])

        confirm = messagebox.askyesno(
            "Confirmar Exclusão",
            f"Deseja realmente excluir o arquivo:\n\n'{filename}'\n\n"
            f"Ele será apagado definitivamente do Google Drive ({conta}) e do SQLite local.",
            icon="warning"
        )
        if not confirm:
            return

        def _worker():
            try:
                self.set_status("Excluindo arquivo remoto e registro...", 30)
                self.manager.delete_file(file_id)
                self.set_status(f"✔ Arquivo '{filename}' excluído.", 0)
                self.refresh_all_async()
            except Exception as e:
                self.set_status(f"Erro ao excluir: {e}", 0)
                messagebox.showerror("Erro de Exclusão", str(e))

        threading.Thread(target=_worker, daemon=True).start()

    def open_auth_dialog(self):
        """Abre janela para gerenciamento e autorização de múltiplas contas (N contas)."""
        diag = ctk.CTkToplevel(self.root) if USE_CTK else ctk.Toplevel(self.root)
        diag.title("Gerenciador de Contas Google Drive - Pool Virtual Multi-Conta")
        diag.geometry("640x600")
        diag.minsize(580, 500)
        diag.grab_set()

        # Frame com scroll ou container
        content = ctk.CTkScrollableFrame(diag, fg_color="transparent") if USE_CTK else ctk.Frame(diag)
        content.pack(fill="both", expand=True, padx=14, pady=12)

        # Header
        lbl = ctk.CTkLabel(
            content,
            text="Gerenciamento de Contas do Virtual Pool",
            font=ctk.CTkFont(size=17, weight="bold"),
            text_color="#38bdf8"
        ) if USE_CTK else ctk.Label(content, text="Gerenciamento de Contas do Virtual Pool", font=("Arial", 14, "bold"))
        lbl.pack(anchor="w", padx=4, pady=(4, 2))

        sub_msg = (
            "Adicione quantas contas Google Drive desejar (2, 3, 5 ou mais).\n"
            "O Virtual Pool unifica o espaço de todas elas com alocação automática MFS."
        )
        ctk.CTkLabel(content, text=sub_msg, justify="left", text_color="#94a3b8", font=ctk.CTkFont(size=11)).pack(anchor="w", padx=4, pady=(0, 8)) if USE_CTK else ctk.Label(content, text=sub_msg, justify="left").pack(anchor="w", padx=4, pady=(0, 8))

        # 1. Status do credentials.json
        creds_frame = ctk.CTkFrame(content, fg_color="#1e293b", corner_radius=10) if USE_CTK else ctk.Frame(content, bg="#1e293b", padx=10, pady=8)
        creds_frame.pack(fill="x", padx=4, pady=6)

        has_creds = os.path.exists("credentials.json")
        creds_status_txt = "✔ credentials.json encontrado na raiz" if has_creds else "⚠ credentials.json não encontrado"
        creds_color = "#10b981" if has_creds else "#f59e0b"

        lbl_creds_stat = ctk.CTkLabel(
            creds_frame, text=creds_status_txt, text_color=creds_color, font=ctk.CTkFont(size=12, weight="bold")
        ) if USE_CTK else ctk.Label(creds_frame, text=creds_status_txt, fg=creds_color, bg="#1e293b", font=("Arial", 10, "bold"))
        lbl_creds_stat.pack(side="left", padx=12, pady=10)

        def pick_credentials():
            import shutil
            chosen = filedialog.askopenfilename(
                title="Selecione o arquivo credentials.json baixado do Google Cloud",
                filetypes=[("Arquivos JSON", "*.json"), ("Todos os Arquivos", "*.*")]
            )
            if chosen:
                try:
                    shutil.copy(chosen, "credentials.json")
                    messagebox.showinfo("Sucesso", "Arquivo 'credentials.json' copiado com sucesso para a pasta do projeto!")
                    lbl_creds_stat.configure(text="✔ credentials.json configurado!", text_color="#10b981") if USE_CTK else lbl_creds_stat.config(text="✔ credentials.json configurado!", fg="#10b981")
                except Exception as ex:
                    messagebox.showerror("Erro", f"Falha ao copiar arquivo: {ex}")

        btn_pick = ctk.CTkButton(
            creds_frame, text="📁 Localizar credentials.json", command=pick_credentials, fg_color="#334155", hover_color="#475569", width=170
        ) if USE_CTK else ctk.Button(creds_frame, text="Localizar credentials.json", command=pick_credentials)
        btn_pick.pack(side="right", padx=12, pady=8)

        # 2. Lista de Contas Cadastradas
        acc_list_frame = ctk.CTkFrame(content, fg_color="#1e293b", corner_radius=10) if USE_CTK else ctk.Frame(content, bg="#1e293b", padx=10, pady=8)
        acc_list_frame.pack(fill="x", padx=4, pady=8)

        lbl_sec1 = ctk.CTkLabel(
            acc_list_frame, text="Contas Cadastradas no Pool", font=ctk.CTkFont(size=13, weight="bold"), text_color="#cbd5e1"
        ) if USE_CTK else ctk.Label(acc_list_frame, text="Contas Cadastradas no Pool", bg="#1e293b", fg="#cbd5e1", font=("Arial", 11, "bold"))
        lbl_sec1.pack(anchor="w", padx=12, pady=(10, 6))

        accounts_box = ctk.CTkFrame(acc_list_frame, fg_color="transparent") if USE_CTK else ctk.Frame(acc_list_frame, bg="#1e293b")
        accounts_box.pack(fill="x", padx=12, pady=(0, 10))

        def reload_accounts_list():
            for w in accounts_box.winfo_children():
                w.destroy()

            registered = self.manager.list_registered_accounts()
            for acc in registered:
                acc_id = acc["id"]
                token_p = acc["token_path"]
                has_token = os.path.exists(token_p)
                status_txt = "✔ Conectado" if has_token else "⚠ Pendente"
                status_col = "#10b981" if has_token else "#f59e0b"

                row = ctk.CTkFrame(accounts_box, fg_color="#0f172a", corner_radius=8) if USE_CTK else ctk.Frame(accounts_box, bg="#0f172a", padx=8, pady=6)
                row.pack(fill="x", pady=3)

                info_txt = f"{acc_id.upper()} • {acc['nome_exibicao']}\n{acc['email'] or 'E-mail não registrado'} • Token: {token_p}"
                lbl_acc = ctk.CTkLabel(
                    row, text=info_txt, font=ctk.CTkFont(size=11), justify="left", text_color="#e2e8f0"
                ) if USE_CTK else ctk.Label(row, text=info_txt, fg="#e2e8f0", bg="#0f172a", justify="left")
                lbl_acc.pack(side="left", padx=10, pady=6)

                btn_del = ctk.CTkButton(
                    row,
                    text="🗑",
                    width=32,
                    fg_color="#ef4444",
                    hover_color="#dc2626",
                    command=lambda target_id=acc_id: remove_acc_action(target_id)
                ) if USE_CTK else ctk.Button(
                    row,
                    text="Remover",
                    fg="white",
                    bg="#ef4444",
                    command=lambda target_id=acc_id: remove_acc_action(target_id)
                )
                btn_del.pack(side="right", padx=(4, 10))

                btn_conn = ctk.CTkButton(
                    row,
                    text=f"🔑 {status_txt}",
                    width=120,
                    fg_color="#0284c7" if not has_token else "#059669",
                    hover_color="#0369a1" if not has_token else "#047857",
                    command=lambda target_id=acc_id: auth_acc(target_id)
                ) if USE_CTK else ctk.Button(
                    row,
                    text=f"Conectar ({status_txt})",
                    command=lambda target_id=acc_id: auth_acc(target_id)
                )
                btn_conn.pack(side="right", padx=4)

        def auth_acc(target_id):
            threading.Thread(target=lambda: self._do_auth(target_id, diag, reload_accounts_list), daemon=True).start()

        def remove_acc_action(target_id):
            if len(self.manager.list_registered_accounts()) <= 1:
                messagebox.showwarning("Aviso", "O Virtual Pool precisa manter ao menos 1 conta cadastrada.")
                return
            if messagebox.askyesno("Confirmar", f"Deseja remover a conta '{target_id}' do pool?"):
                self.manager.remove_account(target_id)
                reload_accounts_list()
                self.refresh_all_async()

        reload_accounts_list()

        # 3. Formulário para Adicionar Nova Conta
        add_frame = ctk.CTkFrame(content, fg_color="#1e293b", corner_radius=10) if USE_CTK else ctk.Frame(content, bg="#1e293b", padx=10, pady=8)
        add_frame.pack(fill="x", padx=4, pady=8)

        lbl_add_title = ctk.CTkLabel(
            add_frame, text="➕ Adicionar Mais uma Conta ao Pool", font=ctk.CTkFont(size=13, weight="bold"), text_color="#38bdf8"
        ) if USE_CTK else ctk.Label(add_frame, text="➕ Adicionar Mais uma Conta ao Pool", bg="#1e293b", fg="#38bdf8", font=("Arial", 11, "bold"))
        lbl_add_title.pack(anchor="w", padx=12, pady=(10, 6))

        form_grid = ctk.CTkFrame(add_frame, fg_color="transparent") if USE_CTK else ctk.Frame(add_frame, bg="#1e293b")
        form_grid.pack(fill="x", padx=12, pady=(0, 10))

        # Sugere próximo ID
        next_id = f"drive_{len(self.manager.list_registered_accounts()) + 1}"

        if USE_CTK:
            ctk.CTkLabel(form_grid, text="ID da Conta (ex: drive_3, backup_drive):", font=ctk.CTkFont(size=11), text_color="#cbd5e1").pack(anchor="w", pady=(2, 1))
            entry_id = ctk.CTkEntry(form_grid, placeholder_text="Identificador único")
            entry_id.insert(0, next_id)
            entry_id.pack(fill="x", pady=(0, 6))

            ctk.CTkLabel(form_grid, text="Nome de Exibição:", font=ctk.CTkFont(size=11), text_color="#cbd5e1").pack(anchor="w", pady=(2, 1))
            entry_nome = ctk.CTkEntry(form_grid, placeholder_text="Nome da conta (ex: Drive 3 - Pessoal)")
            entry_nome.insert(0, f"Conta {len(self.manager.list_registered_accounts()) + 1}")
            entry_nome.pack(fill="x", pady=(0, 6))

            ctk.CTkLabel(form_grid, text="E-mail Google (opcional):", font=ctk.CTkFont(size=11), text_color="#cbd5e1").pack(anchor="w", pady=(2, 1))
            entry_email = ctk.CTkEntry(form_grid, placeholder_text="email@gmail.com")
            entry_email.pack(fill="x", pady=(0, 8))

            def submit_new_account():
                val_id = entry_id.get().strip().lower().replace(" ", "_")
                val_nome = entry_nome.get().strip()
                val_email = entry_email.get().strip() or None
                if not val_id:
                    messagebox.showerror("Erro", "O ID da conta é obrigatório (ex: drive_3).")
                    return
                try:
                    self.manager.add_account(account_id=val_id, display_name=val_nome, email=val_email)
                    messagebox.showinfo("Sucesso", f"Conta '{val_id}' adicionada ao pool!\nIniciando autorização...")
                    reload_accounts_list()
                    self.refresh_all_async()
                    auth_acc(val_id)
                except Exception as ex:
                    messagebox.showerror("Erro", f"Falha ao cadastrar conta: {ex}")

            btn_submit_add = ctk.CTkButton(
                form_grid,
                text="➕ Cadastrar e Conectar Nova Conta",
                fg_color="#0284c7",
                hover_color="#0369a1",
                font=ctk.CTkFont(weight="bold"),
                command=submit_new_account
            )
            btn_submit_add.pack(fill="x", pady=(4, 2))
        else:
            import tkinter as tk
            tk.Label(form_grid, text="ID da Conta (ex: drive_3):", bg="#1e293b", fg="#cbd5e1").pack(anchor="w")
            entry_id = tk.Entry(form_grid)
            entry_id.insert(0, next_id)
            entry_id.pack(fill="x", pady=2)

            tk.Label(form_grid, text="Nome de Exibição:", bg="#1e293b", fg="#cbd5e1").pack(anchor="w")
            entry_nome = tk.Entry(form_grid)
            entry_nome.insert(0, f"Conta {len(self.manager.list_registered_accounts()) + 1}")
            entry_nome.pack(fill="x", pady=2)

            tk.Label(form_grid, text="E-mail (opcional):", bg="#1e293b", fg="#cbd5e1").pack(anchor="w")
            entry_email = tk.Entry(form_grid)
            entry_email.pack(fill="x", pady=2)

            def submit_new_account():
                val_id = entry_id.get().strip().lower().replace(" ", "_")
                val_nome = entry_nome.get().strip()
                val_email = entry_email.get().strip() or None
                if not val_id:
                    return
                self.manager.add_account(account_id=val_id, display_name=val_nome, email=val_email)
                reload_accounts_list()
                self.refresh_all_async()
                auth_acc(val_id)

            tk.Button(form_grid, text="Cadastrar e Conectar", bg="#0284c7", fg="white", command=submit_new_account).pack(fill="x", pady=4)

        # 4. Dica sobre Test Users do Google Cloud Console
        hint_frame = ctk.CTkFrame(content, fg_color="#0f172a", corner_radius=8) if USE_CTK else ctk.Frame(content, bg="#0f172a", padx=8, pady=8)
        hint_frame.pack(fill="x", padx=4, pady=(4, 12))

        hint_txt = (
            "💡 Dica Importante para Multi-Conta:\n"
            "No Google Cloud Console (APIs & Serviços > Tela de permissão OAuth > Test Users),\n"
            "adicione os e-mails de todas as contas que você deseja conectar (drive 1, 2, 3, etc.)\n"
            "para que todas consigam autorizar com o mesmo credentials.json sem restrições."
        )
        ctk.CTkLabel(hint_frame, text=hint_txt, text_color="#38bdf8", font=ctk.CTkFont(size=10), justify="left").pack(anchor="w", padx=10, pady=8) if USE_CTK else ctk.Label(hint_frame, text=hint_txt, fg="#38bdf8", bg="#0f172a", justify="left").pack(padx=8, pady=6)

    def _do_auth(self, acc_id: str, dialog_window: Any, on_success_callback: Optional[Any] = None):
        try:
            self.set_status(f"Iniciando login no navegador para {acc_id}...", 20)
            auth_mgr = self.manager.get_auth_manager(acc_id)
            creds = auth_mgr.get_credentials(interactive=True)
            user = auth_mgr.get_user_info()
            messagebox.showinfo(
                "Conta Conectada",
                f"Conta {acc_id.upper()} autenticada com sucesso!\n"
                f"Usuário: {user.get('displayName')} ({user.get('emailAddress')})\n"
                f"Token salvo em: {auth_mgr.token_path}"
            )
            if on_success_callback:
                self.root.after(0, on_success_callback)
            self.refresh_all_async()
        except FileNotFoundError:
            messagebox.showerror(
                "credentials.json Necessário",
                "Arquivo 'credentials.json' não encontrado na pasta do projeto.\n\n"
                "Para conectar:\n"
                "1. Baixe o client secret JSON do Google Cloud Console (Desktop App).\n"
                "2. Salve-o como 'credentials.json' ou use o botão 'Localizar credentials.json'.\n"
                "3. Consulte o README.md ou a aba 'Setup GCP Guide' para instruções passo a passo."
            )
        except Exception as e:
            messagebox.showerror("Erro de Autenticação", f"Não foi possível autenticar {acc_id}:\n{e}")

    # -------------------------------------------------------------
    # Hub e Launcher de Programas Armazenados no Google Drive
    # -------------------------------------------------------------
    def open_programs_dialog(self):
        """Abre o Hub Interativo de Programas e Aplicativos armazenados no Pool do Drive."""
        diag = ctk.CTkToplevel(self.root) if USE_CTK else tk.Toplevel(self.root)
        diag.title("🚀 Programas e Softwares no Google Drive Virtual Pool")
        diag.geometry("780x620")
        diag.configure(fg_color="#0f172a" if USE_CTK else None)
        if not USE_CTK:
            diag.configure(bg="#0f172a")

        # Top Header
        top_bar = ctk.CTkFrame(diag, fg_color="#1e293b", corner_radius=10) if USE_CTK else tk.Frame(diag, bg="#1e293b", padx=16, pady=12)
        top_bar.pack(fill="x", padx=16, pady=(16, 8))

        top_info = ctk.CTkFrame(top_bar, fg_color="transparent") if USE_CTK else tk.Frame(top_bar, bg="#1e293b")
        top_info.pack(side="left", padx=14, pady=10)

        lbl_t = ctk.CTkLabel(
            top_info,
            text="🚀 Catálogo de Softwares no Google Drive",
            font=ctk.CTkFont(size=16, weight="bold"),
            text_color="#38bdf8"
        ) if USE_CTK else tk.Label(top_info, text="🚀 Catálogo de Softwares no Google Drive", font=("Arial", 14, "bold"), fg="#38bdf8", bg="#1e293b")
        lbl_t.pack(anchor="w")

        lbl_sub = ctk.CTkLabel(
            top_info,
            text="Execute, instale ou baixe seus programas armazenados nas contas do pool",
            font=ctk.CTkFont(size=12),
            text_color="#94a3b8"
        ) if USE_CTK else tk.Label(top_info, text="Execute, instale ou baixe seus programas armazenados nas contas do pool", font=("Arial", 10), fg="#94a3b8", bg="#1e293b")
        lbl_sub.pack(anchor="w")

        top_actions = ctk.CTkFrame(top_bar, fg_color="transparent") if USE_CTK else tk.Frame(top_bar, bg="#1e293b")
        top_actions.pack(side="right", padx=14, pady=10)

        # Container de busca e filtros
        filter_bar = ctk.CTkFrame(diag, fg_color="#1e293b", corner_radius=10) if USE_CTK else tk.Frame(diag, bg="#1e293b", padx=12, pady=8)
        filter_bar.pack(fill="x", padx=16, pady=6)

        search_var = tk.StringVar(value="")
        cat_var = tk.StringVar(value="Todos")

        # Scrollable container para a lista de programas
        if USE_CTK:
            scroll_frame = ctk.CTkScrollableFrame(diag, fg_color="transparent", corner_radius=10)
            scroll_frame.pack(fill="both", expand=True, padx=16, pady=8)
        else:
            scroll_canvas = tk.Canvas(diag, bg="#0f172a", highlightthickness=0)
            scrollbar = tk.Scrollbar(diag, orient="vertical", command=scroll_canvas.yview)
            scroll_frame = tk.Frame(scroll_canvas, bg="#0f172a")
            scroll_frame.bind("<Configure>", lambda e: scroll_canvas.configure(scrollregion=scroll_canvas.bbox("all")))
            scroll_canvas.create_window((0, 0), window=scroll_frame, anchor="nw")
            scroll_canvas.configure(yscrollcommand=scrollbar.set)
            scrollbar.pack(side="right", fill="y")
            scroll_canvas.pack(fill="both", expand=True, padx=16, pady=8)

        def refresh_program_list():
            for widget in scroll_frame.winfo_children():
                widget.destroy()

            search_val = search_var.get().strip()
            cat_val = cat_var.get()
            progs = self.manager.list_programs(
                categoria=None if cat_val == "Todos" else cat_val,
                search=search_val if search_val else None
            )

            if not progs:
                empty_box = ctk.CTkFrame(scroll_frame, fg_color="#1e293b", corner_radius=10) if USE_CTK else tk.Frame(scroll_frame, bg="#1e293b", padx=20, pady=30)
                empty_box.pack(fill="x", pady=20, padx=8)
                msg = ctk.CTkLabel(
                    empty_box,
                    text="Nenhum programa encontrado para o filtro atual.\nClique em '+ Adicionar Programa' para enviar um instalador ou aplicativo.",
                    font=ctk.CTkFont(size=13),
                    text_color="#94a3b8"
                ) if USE_CTK else tk.Label(empty_box, text="Nenhum programa encontrado.", font=("Arial", 12), fg="#94a3b8", bg="#1e293b")
                msg.pack(pady=20)
                return

            for p in progs:
                card = ctk.CTkFrame(scroll_frame, fg_color="#1e293b", corner_radius=10) if USE_CTK else tk.Frame(scroll_frame, bg="#1e293b", padx=14, pady=10, relief="groove")
                card.pack(fill="x", pady=6, padx=4)

                header_c = ctk.CTkFrame(card, fg_color="transparent") if USE_CTK else tk.Frame(card, bg="#1e293b")
                header_c.pack(fill="x", padx=12, pady=(10, 4))

                # Nome e Versão
                title_line = ctk.CTkFrame(header_c, fg_color="transparent") if USE_CTK else tk.Frame(header_c, bg="#1e293b")
                title_line.pack(side="left")

                name_lbl = ctk.CTkLabel(
                    title_line,
                    text=f"💻 {p['nome_programa']}",
                    font=ctk.CTkFont(size=14, weight="bold"),
                    text_color="#f8fafc"
                ) if USE_CTK else tk.Label(title_line, text=f"💻 {p['nome_programa']}", font=("Arial", 12, "bold"), fg="#f8fafc", bg="#1e293b")
                name_lbl.pack(side="left")

                badge_v = ctk.CTkLabel(
                    title_line,
                    text=f"v{p['versao']}",
                    font=ctk.CTkFont(size=11, weight="bold"),
                    text_color="#38bdf8"
                ) if USE_CTK else tk.Label(title_line, text=f"v{p['versao']}", font=("Arial", 9, "bold"), fg="#38bdf8", bg="#1e293b")
                badge_v.pack(side="left", padx=8)

                # Badges: Categoria, Plataforma e Conta
                acc_name = p.get("conta_origem") or "Pool Virtual"
                size_str = format_bytes(p["tamanho_bytes"]) if p.get("tamanho_bytes") else "Online"
                info_text = f"{p['categoria']}  •  {p['plataforma']}  •  {acc_name.upper()}  •  {size_str}"

                sub_lbl = ctk.CTkLabel(
                    header_c,
                    text=info_text,
                    font=ctk.CTkFont(size=11),
                    text_color="#a855f7"
                ) if USE_CTK else tk.Label(header_c, text=info_text, font=("Arial", 9), fg="#a855f7", bg="#1e293b")
                sub_lbl.pack(side="right")

                if p.get("descricao"):
                    desc_lbl = ctk.CTkLabel(
                        card,
                        text=p["descricao"],
                        font=ctk.CTkFont(size=11),
                        text_color="#94a3b8",
                        anchor="w",
                        justify="left"
                    ) if USE_CTK else tk.Label(card, text=p["descricao"], font=("Arial", 9), fg="#94a3b8", bg="#1e293b", anchor="w", justify="left")
                    desc_lbl.pack(fill="x", padx=12, pady=(2, 6))

                # Botões de Ação do Programa
                act_frame = ctk.CTkFrame(card, fg_color="transparent") if USE_CTK else tk.Frame(card, bg="#1e293b")
                act_frame.pack(fill="x", padx=12, pady=(4, 10))

                cmd_txt = p.get("comando_execucao") or f"python main.py launch {p['id']}"

                def make_launch_handler(prog_item=p):
                    return lambda: self._launch_program_gui(prog_item)

                def make_copy_cmd_handler(cmd=cmd_txt):
                    return lambda: self._copy_to_clipboard(cmd, "Comando copiado para a área de transferência!")

                def make_download_handler(prog_item=p):
                    return lambda: self._download_program_gui(prog_item)

                btn_run = ctk.CTkButton(
                    act_frame,
                    text="▶ Executar / Abrir",
                    command=make_launch_handler(),
                    fg_color="#059669",
                    hover_color="#047857",
                    width=130,
                    height=28,
                    font=ctk.CTkFont(size=11, weight="bold")
                ) if USE_CTK else tk.Button(act_frame, text="▶ Executar / Abrir", bg="#059669", fg="white", font=("Arial", 9, "bold"), command=make_launch_handler())
                btn_run.pack(side="left", padx=(0, 6))

                btn_dl = ctk.CTkButton(
                    act_frame,
                    text="📥 Baixar",
                    command=make_download_handler(),
                    fg_color="#334155",
                    hover_color="#475569",
                    width=90,
                    height=28,
                    font=ctk.CTkFont(size=11)
                ) if USE_CTK else tk.Button(act_frame, text="📥 Baixar", bg="#334155", fg="white", font=("Arial", 9), command=make_download_handler())
                btn_dl.pack(side="left", padx=4)

                btn_cp = ctk.CTkButton(
                    act_frame,
                    text="📋 Copiar Comando",
                    command=make_copy_cmd_handler(),
                    fg_color="#1e293b",
                    hover_color="#334155",
                    border_width=1,
                    border_color="#475569",
                    width=130,
                    height=28,
                    font=ctk.CTkFont(size=11)
                ) if USE_CTK else tk.Button(act_frame, text="📋 Copiar Comando", bg="#1e293b", fg="white", font=("Arial", 9), command=make_copy_cmd_handler())
                btn_cp.pack(side="left", padx=4)

        # Monta a barra de pesquisa
        search_entry = ctk.CTkEntry(
            filter_bar,
            placeholder_text="Buscar por nome, descrição ou arquivo...",
            textvariable=search_var,
            width=280
        ) if USE_CTK else tk.Entry(filter_bar, textvariable=search_var, width=30)
        search_entry.pack(side="left", padx=6, pady=4)
        search_entry.bind("<KeyRelease>", lambda e: refresh_program_list())

        # Categorias chips/dropdown
        categories = ["Todos", "Produtividade", "Desenvolvimento", "Utilitários", "Design & 3D"]
        for cat in categories:
            def make_cat_filter(c=cat):
                return lambda: [cat_var.set(c), refresh_program_list()]

            btn_c = ctk.CTkButton(
                filter_bar,
                text=cat,
                command=make_cat_filter(),
                fg_color="#334155",
                hover_color="#475569",
                width=80,
                height=26,
                font=ctk.CTkFont(size=10)
            ) if USE_CTK else tk.Button(filter_bar, text=cat, font=("Arial", 8), bg="#334155", fg="white", command=make_cat_filter())
            btn_c.pack(side="left", padx=3, pady=4)

        # Botão + Adicionar Programa
        btn_add_p = ctk.CTkButton(
            top_actions,
            text="+ Cadastrar Programa",
            command=lambda: self.open_add_program_dialog(on_created=refresh_program_list),
            fg_color="#0284c7",
            hover_color="#0369a1",
            width=150
        ) if USE_CTK else tk.Button(top_actions, text="+ Cadastrar Programa", bg="#0284c7", fg="white", font=("Arial", 9, "bold"), command=lambda: self.open_add_program_dialog(on_created=refresh_program_list))
        btn_add_p.pack(side="right", padx=4)

        refresh_program_list()

    def _copy_to_clipboard(self, text: str, msg: str = "Copiado!"):
        self.root.clipboard_clear()
        self.root.clipboard_append(text)
        messagebox.showinfo("Copiado", f"{msg}\n\n{text}")

    def _launch_program_gui(self, prog: Dict[str, Any]):
        """Executa um programa do catálogo em segundo plano."""
        def run():
            try:
                self.set_status(f"Iniciando {prog['nome_programa']} do Google Drive...", 30)
                res = self.manager.launch_program(str(prog["id"]))
                cmd = res.get("comando_execucao")
                cache_path = res.get("caminho_local")

                self.set_status(f"Pronto: {prog['nome_programa']}", 100)
                messagebox.showinfo(
                    "Programa Pronto para Execução",
                    f"✔ {prog['nome_programa']} (v{prog['versao']})\n\n"
                    f"Conta no Drive: {prog.get('conta_origem', 'Pool')}\n"
                    f"Caminho Local: {cache_path or 'Em cache'}\n"
                    f"Comando de Execução: {cmd}\n\n"
                    f"Ambiente local disparado com sucesso!"
                )
            except Exception as e:
                messagebox.showerror("Erro ao Executar", f"Falha ao abrir programa:\n{e}")

        threading.Thread(target=run, daemon=True).start()

    def _download_program_gui(self, prog: Dict[str, Any]):
        """Permite baixar o arquivo do programa para uma pasta escolhida pelo usuário."""
        if not prog.get("arquivo_id"):
            messagebox.showwarning("Aviso", "Este programa não possui arquivo remoto associado.")
            return

        dest_dir = filedialog.askdirectory(title="Selecione a pasta de destino para download")
        if not dest_dir:
            return

        def run():
            try:
                self.set_status(f"Baixando {prog['nome_programa']}...", 20)
                _, saved = self.manager.download_file(str(prog["arquivo_id"]), dest_dir)
                self.set_status("Download de programa concluído!", 100)
                messagebox.showinfo("Download Concluído", f"Programa baixado com sucesso em:\n{saved}")
            except Exception as e:
                messagebox.showerror("Erro de Download", f"Falha ao baixar:\n{e}")

        threading.Thread(target=run, daemon=True).start()

    def open_add_program_dialog(self, on_created: Optional[Any] = None):
        """Abre modal para cadastrar e enviar um novo programa ao Drive com alocação inteligente MFS."""
        diag = ctk.CTkToplevel(self.root) if USE_CTK else tk.Toplevel(self.root)
        diag.title("Cadastrar Novo Programa no Google Drive Pool")
        diag.geometry("560x520")
        diag.configure(fg_color="#0f172a" if USE_CTK else None)

        ctk.CTkLabel(
            diag,
            text="Cadastrar Novo Software / Instalador no Drive",
            font=ctk.CTkFont(size=15, weight="bold"),
            text_color="#38bdf8"
        ).pack(anchor="w", padx=20, pady=(16, 4)) if USE_CTK else tk.Label(diag, text="Cadastrar Novo Software no Drive", font=("Arial", 12, "bold"), fg="#38bdf8").pack(anchor="w", padx=20, pady=10)

        entry_name = ctk.CTkEntry(diag, placeholder_text="Nome do Software (ex: Blender 4.2 Portable)") if USE_CTK else tk.Entry(diag)
        entry_name.pack(fill="x", padx=20, pady=6)

        entry_ver = ctk.CTkEntry(diag, placeholder_text="Versão (ex: 2.1.0)") if USE_CTK else tk.Entry(diag)
        entry_ver.pack(fill="x", padx=20, pady=6)

        entry_cat = ctk.CTkEntry(diag, placeholder_text="Categoria (ex: Utilitários, Produtividade, Dev)") if USE_CTK else tk.Entry(diag)
        entry_cat.pack(fill="x", padx=20, pady=6)

        entry_plat = ctk.CTkEntry(diag, placeholder_text="Plataforma (ex: Windows, Linux, macOS, Python)") if USE_CTK else tk.Entry(diag)
        entry_plat.pack(fill="x", padx=20, pady=6)

        entry_cmd = ctk.CTkEntry(diag, placeholder_text="Comando de Execução (ex: app.exe --portable)") if USE_CTK else tk.Entry(diag)
        entry_cmd.pack(fill="x", padx=20, pady=6)

        entry_desc = ctk.CTkEntry(diag, placeholder_text="Descrição curta ou observações") if USE_CTK else tk.Entry(diag)
        entry_desc.pack(fill="x", padx=20, pady=6)

        file_path_var = tk.StringVar(value="")
        lbl_file = ctk.CTkLabel(diag, text="Nenhum arquivo local selecionado (opcional)", text_color="#94a3b8", font=ctk.CTkFont(size=11)) if USE_CTK else tk.Label(diag, text="Nenhum arquivo selecionado", fg="#94a3b8")
        lbl_file.pack(anchor="w", padx=20, pady=(6, 2))

        def pick_file():
            f = filedialog.askopenfilename(title="Selecione o executável, instalador ou arquivo .zip")
            if f:
                file_path_var.set(f)
                lbl_file.configure(text=f"Arquivo selecionado: {os.path.basename(f)}")

        btn_pick = ctk.CTkButton(
            diag,
            text="📁 Selecionar Arquivo/Instalador Local (Opcional)",
            command=pick_file,
            fg_color="#334155",
            hover_color="#475569"
        ) if USE_CTK else tk.Button(diag, text="Selecionar Arquivo", command=pick_file)
        btn_pick.pack(fill="x", padx=20, pady=6)

        def save_program():
            nome = entry_name.get().strip()
            if not nome:
                messagebox.showerror("Erro", "O Nome do Software é obrigatório.")
                return

            versao = entry_ver.get().strip() or "1.0.0"
            cat = entry_cat.get().strip() or "Utilitários"
            plat = entry_plat.get().strip() or "Multiplataforma"
            cmd = entry_cmd.get().strip() or ""
            desc = entry_desc.get().strip() or ""
            arq = file_path_var.get().strip() or None

            try:
                self.manager.add_program(
                    nome_programa=nome,
                    local_file_path_or_id=arq,
                    versao=versao,
                    categoria=cat,
                    plataforma=plat,
                    descricao=desc,
                    comando_execucao=cmd
                )
                messagebox.showinfo("Sucesso", f"Programa '{nome}' cadastrado com sucesso no Google Drive Pool!")
                diag.destroy()
                if on_created:
                    on_created()
            except Exception as e:
                messagebox.showerror("Erro ao Salvar", f"Falha ao registrar programa:\n{e}")

        btn_save = ctk.CTkButton(
            diag,
            text="💾 Salvar e Sincronizar com o Pool",
            command=save_program,
            fg_color="#0284c7",
            hover_color="#0369a1",
            font=ctk.CTkFont(weight="bold")
        ) if USE_CTK else tk.Button(diag, text="Salvar Programa", bg="#0284c7", fg="white", command=save_program)
        btn_save.pack(fill="x", padx=20, pady=(16, 10))

    # -------------------------------------------------------------
    # Hub de Sincronização Automática de Pastas Locais (MFS Watcher)
    # -------------------------------------------------------------
    def open_sync_folders_dialog(self):
        """Abre a janela de gerenciamento de pastas designadas e controle do Watcher MFS."""
        diag = ctk.CTkToplevel(self.root) if USE_CTK else tk.Toplevel(self.root)
        diag.title("📁 Sincronização Automática de Pastas Locais (MFS)")
        diag.geometry("880x620")
        diag.minsize(760, 500)

        # Header do diálogo
        hdr = ctk.CTkFrame(diag, fg_color="#1e293b", corner_radius=10) if USE_CTK else tk.Frame(diag, bg="#1e293b", padx=16, pady=12)
        hdr.pack(fill="x", padx=16, pady=(16, 10))

        title_box = ctk.CTkFrame(hdr, fg_color="transparent") if USE_CTK else tk.Frame(hdr, bg="#1e293b")
        title_box.pack(side="left", padx=14, pady=10)

        lbl_t = ctk.CTkLabel(
            title_box,
            text="📁 Pastas Designadas para Auto-Sync com o Pool",
            font=ctk.CTkFont(size=16, weight="bold"),
            text_color="#38bdf8"
        ) if USE_CTK else tk.Label(title_box, text="📁 Pastas Designadas para Auto-Sync", font=("Arial", 14, "bold"), fg="#38bdf8", bg="#1e293b")
        lbl_t.pack(anchor="w")

        lbl_sub = ctk.CTkLabel(
            title_box,
            text="Detecção em tempo real e upload com distribuição inteligente Most Free Space (MFS)",
            font=ctk.CTkFont(size=11),
            text_color="#94a3b8"
        ) if USE_CTK else tk.Label(title_box, text="Detecção em tempo real e upload inteligente via MFS", font=("Arial", 9), fg="#94a3b8", bg="#1e293b")
        lbl_sub.pack(anchor="w")

        # Barra de Ações Superior
        actions_bar = ctk.CTkFrame(diag, fg_color="transparent") if USE_CTK else tk.Frame(diag)
        actions_bar.pack(fill="x", padx=16, pady=(0, 10))

        lbl_watcher_status = ctk.CTkLabel(
            actions_bar,
            text="● Watcher Ativo (Monitorando)" if self.active_watcher and self.active_watcher.is_running else "○ Watcher Parado",
            text_color="#10b981" if self.active_watcher and self.active_watcher.is_running else "#94a3b8",
            font=ctk.CTkFont(size=12, weight="bold")
        ) if USE_CTK else tk.Label(actions_bar, text="Watcher", font=("Arial", 10, "bold"))
        lbl_watcher_status.pack(side="left", padx=4)

        scroll_cards = ctk.CTkScrollableFrame(diag, fg_color="#0f172a") if USE_CTK else tk.Frame(diag, bg="#0f172a")
        scroll_cards.pack(fill="both", expand=True, padx=16, pady=4)

        def render_folders():
            for w in scroll_cards.winfo_children():
                w.destroy()

            folders = self.manager.list_sync_folders()
            if not folders:
                empty_lbl = ctk.CTkLabel(
                    scroll_cards,
                    text="Nenhuma pasta local designada ainda.\nClique em '+ Designar Pasta' para começar a sincronizar com o Pool.",
                    text_color="#64748b",
                    font=ctk.CTkFont(size=13)
                ) if USE_CTK else tk.Label(scroll_cards, text="Nenhuma pasta designada.", fg="#64748b", bg="#0f172a")
                empty_lbl.pack(pady=40)
                return

            for f in folders:
                card = ctk.CTkFrame(scroll_cards, fg_color="#1e293b", corner_radius=10) if USE_CTK else tk.Frame(scroll_cards, bg="#1e293b", relief="ridge", bd=1)
                card.pack(fill="x", pady=6, padx=6)

                # Info principal
                info_box = ctk.CTkFrame(card, fg_color="transparent") if USE_CTK else tk.Frame(card, bg="#1e293b")
                info_box.pack(side="left", fill="both", expand=True, padx=14, pady=10)

                top_line = ctk.CTkFrame(info_box, fg_color="transparent") if USE_CTK else tk.Frame(info_box, bg="#1e293b")
                top_line.pack(fill="x")

                nome_lbl = ctk.CTkLabel(
                    top_line,
                    text=f["nome_identificador"],
                    font=ctk.CTkFont(size=14, weight="bold"),
                    text_color="#f8fafc"
                ) if USE_CTK else tk.Label(top_line, text=f["nome_identificador"], font=("Arial", 11, "bold"), fg="white", bg="#1e293b")
                nome_lbl.pack(side="left")

                is_active = bool(f.get("ativo", 1))
                status_badge = ctk.CTkLabel(
                    top_line,
                    text="Ativo" if is_active else "Pausado",
                    fg_color="#065f46" if is_active else "#374151",
                    text_color="#6ee7b7" if is_active else "#9ca3af",
                    corner_radius=6,
                    font=ctk.CTkFont(size=11, weight="bold"),
                    padx=8,
                    pady=2
                ) if USE_CTK else tk.Label(top_line, text="Ativo" if is_active else "Pausado", bg="#065f46" if is_active else "#374151", fg="white")
                status_badge.pack(side="left", padx=10)

                path_lbl = ctk.CTkLabel(
                    info_box,
                    text=f"📂 {f['caminho_local']}",
                    font=ctk.CTkFont(size=11),
                    text_color="#38bdf8"
                ) if USE_CTK else tk.Label(info_box, text=f"📂 {f['caminho_local']}", fg="#38bdf8", bg="#1e293b", font=("Arial", 9))
                path_lbl.pack(anchor="w", pady=(2, 4))

                ultimo = f.get("ultimo_sync")
                ultimo_str = ultimo[:19].replace("T", " ") if ultimo else "Ainda não sincronizado"
                stats_lbl = ctk.CTkLabel(
                    info_box,
                    text=f"📊 {f.get('total_arquivos', 0)} arquivos transferidos • {f.get('total_bytes_formatado', '0 B')} • Último sync: {ultimo_str}",
                    font=ctk.CTkFont(size=11),
                    text_color="#94a3b8"
                ) if USE_CTK else tk.Label(info_box, text=f"Total: {f.get('total_arquivos', 0)} arq", fg="#94a3b8", bg="#1e293b", font=("Arial", 9))
                stats_lbl.pack(anchor="w")

                # Botões de ação do card
                btns_box = ctk.CTkFrame(card, fg_color="transparent") if USE_CTK else tk.Frame(card, bg="#1e293b")
                btns_box.pack(side="right", padx=12, pady=10)

                def make_sync_handler(folder_id):
                    def handler():
                        def run_bg():
                            try:
                                res = self.manager.sync_folder(str(folder_id))
                                messagebox.showinfo(
                                    "Sincronização Concluída",
                                    f"Sucesso na sincronização!\n"
                                    f"• {res['arquivos_enviados']} arquivos novos enviados via MFS\n"
                                    f"• {res['arquivos_ignorados']} já sincronizados\n"
                                    f"• Volume: {res['bytes_sincronizados_formatado']}"
                                )
                                self.root.after(0, render_folders)
                                self.refresh_all_async()
                            except Exception as err:
                                messagebox.showerror("Erro de Sincronização", f"Falha ao sincronizar pasta:\n{err}")
                        threading.Thread(target=run_bg, daemon=True).start()
                    return handler

                btn_sync_now = ctk.CTkButton(
                    btns_box,
                    text="⚡ Sincronizar",
                    width=100,
                    fg_color="#0284c7",
                    hover_color="#0369a1",
                    command=make_sync_handler(f["id"])
                ) if USE_CTK else tk.Button(btns_box, text="Sincronizar", command=make_sync_handler(f["id"]))
                btn_sync_now.pack(side="left", padx=4)

                def make_toggle_handler(folder_id):
                    def handler():
                        self.manager.toggle_sync_folder(folder_id)
                        render_folders()
                    return handler

                btn_toggle = ctk.CTkButton(
                    btns_box,
                    text="Pausar" if is_active else "Ativar",
                    width=80,
                    fg_color="#475569",
                    hover_color="#334155",
                    command=make_toggle_handler(f["id"])
                ) if USE_CTK else tk.Button(btns_box, text="Toggle", command=make_toggle_handler(f["id"]))
                btn_toggle.pack(side="left", padx=4)

                def make_del_handler(folder_id, folder_name):
                    def handler():
                        if messagebox.askyesno("Remover Pasta", f"Deseja remover a pasta '{folder_name}' da lista de sincronização?"):
                            self.manager.remove_sync_folder(str(folder_id))
                            render_folders()
                    return handler

                btn_del = ctk.CTkButton(
                    btns_box,
                    text="🗑",
                    width=40,
                    fg_color="#dc2626",
                    hover_color="#b91c1c",
                    command=make_del_handler(f["id"], f["nome_identificador"])
                ) if USE_CTK else tk.Button(btns_box, text="X", command=make_del_handler(f["id"], f["nome_identificador"]))
                btn_del.pack(side="left", padx=4)

        def toggle_watcher_daemon():
            from drive_pool.watcher import FolderWatcher
            if self.active_watcher and self.active_watcher.is_running:
                self.active_watcher.stop()
                self.active_watcher = None
                if USE_CTK:
                    btn_watcher_toggle.configure(text="▶ Iniciar Watcher", fg_color="#059669")
                    lbl_watcher_status.configure(text="○ Watcher Parado", text_color="#94a3b8")
                messagebox.showinfo("Watcher Parado", "O serviço de monitoramento automático foi interrompido.")
            else:
                self.active_watcher = FolderWatcher(manager=self.manager, poll_interval=5.0)
                def on_sync_event(res):
                    if res.get("uploaded", 0) > 0:
                        self.root.after(0, render_folders)
                        self.refresh_all_async()

                self.watcher_thread = threading.Thread(
                    target=lambda: self.active_watcher.run_loop(callback_on_sync=on_sync_event),
                    daemon=True
                )
                self.watcher_thread.start()
                if USE_CTK:
                    btn_watcher_toggle.configure(text="⏹ Parar Watcher", fg_color="#dc2626")
                    lbl_watcher_status.configure(text="● Watcher Ativo (Monitorando)", text_color="#10b981")
                messagebox.showinfo(
                    "Watcher Ativo",
                    "Watcher em tempo real iniciado!\nQualquer arquivo novo salvo nas pastas designadas será automaticamente enviado para a conta Google Drive com mais espaço livre (MFS)."
                )

        btn_add = ctk.CTkButton(
            actions_bar,
            text="+ Designar Pasta",
            fg_color="#0284c7",
            hover_color="#0369a1",
            width=140,
            command=lambda: self.open_add_sync_folder_dialog(diag, on_added=render_folders)
        ) if USE_CTK else tk.Button(actions_bar, text="+ Designar Pasta", command=lambda: self.open_add_sync_folder_dialog(diag, on_added=render_folders))
        btn_add.pack(side="right", padx=4)

        btn_sync_all = ctk.CTkButton(
            actions_bar,
            text="⚡ Sincronizar Tudo",
            fg_color="#334155",
            hover_color="#475569",
            width=130,
            command=lambda: threading.Thread(target=lambda: [self.manager.sync_all_active_folders(), self.root.after(0, render_folders), self.refresh_all_async()], daemon=True).start()
        ) if USE_CTK else tk.Button(actions_bar, text="Sincronizar Tudo")
        btn_sync_all.pack(side="right", padx=4)

        btn_watcher_toggle = ctk.CTkButton(
            actions_bar,
            text="⏹ Parar Watcher" if (self.active_watcher and self.active_watcher.is_running) else "▶ Iniciar Watcher",
            fg_color="#dc2626" if (self.active_watcher and self.active_watcher.is_running) else "#059669",
            hover_color="#b91c1c" if (self.active_watcher and self.active_watcher.is_running) else "#047857",
            width=140,
            command=toggle_watcher_daemon
        ) if USE_CTK else tk.Button(actions_bar, text="Toggle Watcher", command=toggle_watcher_daemon)
        btn_watcher_toggle.pack(side="right", padx=4)

        render_folders()

    def open_add_sync_folder_dialog(self, parent_window, on_added: Optional[Callable[[], None]] = None):
        """Abre modal para escolher ou digitar uma pasta local para monitorar."""
        from tkinter import filedialog
        diag = ctk.CTkToplevel(parent_window) if USE_CTK else tk.Toplevel(parent_window)
        diag.title("Designar Pasta para Sincronização")
        diag.geometry("540x330")
        diag.transient(parent_window)

        lbl = ctk.CTkLabel(
            diag,
            text="Designar Pasta Local para Auto-Sync com o Pool",
            font=ctk.CTkFont(size=14, weight="bold"),
            text_color="#38bdf8"
        ) if USE_CTK else tk.Label(diag, text="Designar Pasta Local", font=("Arial", 12, "bold"))
        lbl.pack(pady=(16, 8))

        path_var = tk.StringVar()
        name_var = tk.StringVar()
        rec_var = tk.BooleanVar(value=True)

        box = ctk.CTkFrame(diag, fg_color="transparent") if USE_CTK else tk.Frame(diag)
        box.pack(fill="x", padx=24, pady=10)

        ctk.CTkLabel(box, text="Caminho do Diretório Local:").pack(anchor="w")
        p_row = ctk.CTkFrame(box, fg_color="transparent") if USE_CTK else tk.Frame(box)
        p_row.pack(fill="x", pady=(2, 8))

        entry_path = ctk.CTkEntry(p_row, textvariable=path_var, placeholder_text="/caminho/para/pasta") if USE_CTK else tk.Entry(p_row, textvariable=path_var)
        entry_path.pack(side="left", fill="x", expand=True)

        def pick_folder():
            chosen = filedialog.askdirectory(title="Selecione a Pasta Local para Sincronizar")
            if chosen:
                path_var.set(chosen)
                if not name_var.get():
                    name_var.set(os.path.basename(chosen) or chosen)

        btn_browse = ctk.CTkButton(p_row, text="Buscar...", width=80, command=pick_folder) if USE_CTK else tk.Button(p_row, text="Buscar", command=pick_folder)
        btn_browse.pack(side="left", padx=(8, 0))

        ctk.CTkLabel(box, text="Nome de Identificação (opcional):").pack(anchor="w")
        entry_name = ctk.CTkEntry(box, textvariable=name_var, placeholder_text="Ex: Documentos de Trabalho") if USE_CTK else tk.Entry(box, textvariable=name_var)
        entry_name.pack(fill="x", pady=(2, 8))

        chk = ctk.CTkCheckBox(box, text="Sincronizar subdiretórios recursivamente", variable=rec_var) if USE_CTK else tk.Checkbutton(box, text="Recursivo", variable=rec_var)
        chk.pack(anchor="w", pady=(2, 10))

        def confirm_add():
            p = path_var.get().strip()
            if not p:
                messagebox.showerror("Erro", "O caminho do diretório é obrigatório.")
                return
            n = name_var.get().strip() or None
            try:
                self.manager.add_sync_folder(p, nome_identificador=n, recursivo=rec_var.get())
                messagebox.showinfo("Sucesso", f"Pasta '{p}' designada com sucesso para Auto-Sync!")
                diag.destroy()
                if on_added:
                    on_added()
            except Exception as e:
                messagebox.showerror("Erro ao Adicionar", f"Falha ao cadastrar pasta:\n{e}")

        btn_save = ctk.CTkButton(diag, text="Salvar Pasta Designada", fg_color="#059669", hover_color="#047857", command=confirm_add) if USE_CTK else tk.Button(diag, text="Salvar", command=confirm_add)
        btn_save.pack(fill="x", padx=24, pady=10)




def run_gui():
    """Inicializa a interface gráfica."""
    if USE_CTK:
        root = ctk.CTk()
    else:
        import tkinter as tk
        root = tk.Tk()

    app = DrivePoolDesktopApp(root)
    root.mainloop()


if __name__ == "__main__":
    run_gui()
