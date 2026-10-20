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

        # Botão Conectar Contas no topo direito
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

        # 2. Painel de Capacidade do Pool (Card Superior)
        self.pool_card = ctk.CTkFrame(self.main_container, fg_color="#1e293b", corner_radius=12)
        self.pool_card.pack(fill="x", padx=16, pady=8)

        # Título do Card e Métricas
        metrics_frame = ctk.CTkFrame(self.pool_card, fg_color="transparent")
        metrics_frame.pack(fill="x", padx=16, pady=(12, 6))

        self.lbl_pool_title = ctk.CTkLabel(
            metrics_frame,
            text="CAPACIDADE TOTAL DO POOL (DRIVE 1 + DRIVE 2)",
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

        # Mini cartões individuais de Drive 1 e Drive 2
        drives_subframe = ctk.CTkFrame(self.pool_card, fg_color="transparent")
        drives_subframe.pack(fill="x", padx=16, pady=(0, 12))

        # Drive 1 Box
        self.d1_box = ctk.CTkFrame(drives_subframe, fg_color="#0f172a", corner_radius=8)
        self.d1_box.pack(side="left", fill="x", expand=True, padx=(0, 6), pady=2)
        self.lbl_d1_title = ctk.CTkLabel(self.d1_box, text="Conta 1 (drive_1)", font=ctk.CTkFont(weight="bold", size=12))
        self.lbl_d1_title.pack(anchor="w", padx=10, pady=(6, 2))
        self.lbl_d1_info = ctk.CTkLabel(self.d1_box, text="Verificando...", text_color="#94a3b8", font=ctk.CTkFont(size=11))
        self.lbl_d1_info.pack(anchor="w", padx=10, pady=(0, 4))
        self.d1_progress = ctk.CTkProgressBar(self.d1_box, height=8)
        self.d1_progress.set(0)
        self.d1_progress.pack(fill="x", padx=10, pady=(0, 8))

        # Drive 2 Box
        self.d2_box = ctk.CTkFrame(drives_subframe, fg_color="#0f172a", corner_radius=8)
        self.d2_box.pack(side="right", fill="x", expand=True, padx=(6, 0), pady=2)
        self.lbl_d2_title = ctk.CTkLabel(self.d2_box, text="Conta 2 (drive_2)", font=ctk.CTkFont(weight="bold", size=12))
        self.lbl_d2_title.pack(anchor="w", padx=10, pady=(6, 2))
        self.lbl_d2_info = ctk.CTkLabel(self.d2_box, text="Verificando...", text_color="#94a3b8", font=ctk.CTkFont(size=11))
        self.lbl_d2_info.pack(anchor="w", padx=10, pady=(0, 4))
        self.d2_progress = ctk.CTkProgressBar(self.d2_box, height=8)
        self.d2_progress.set(0)
        self.d2_progress.configure(progress_color="#eab308")
        self.d2_progress.pack(fill="x", padx=10, pady=(0, 8))

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

        tk.Label(
            header,
            text="Google Drive Virtual Storage Pool",
            font=("Arial", 16, "bold"),
            fg="#38bdf8",
            bg="#1e293b"
        ).pack(anchor="w")

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

        # Atualiza mini cards
        accounts = status["accounts"]
        d1 = accounts.get("drive_1", {})
        d2 = accounts.get("drive_2", {})

        if USE_CTK:
            if d1.get("authenticated") and d1.get("quota"):
                q1 = d1["quota"]
                self.lbl_d1_info.configure(text=f"{q1['formatted_usage']} / {q1['formatted_limit']} (Livre: {q1['formatted_free']})")
                self.d1_progress.set(q1["percent_used"] / 100.0)
            else:
                self.lbl_d1_info.configure(text="Não autenticado (requer token_drive1.json)")
                self.d1_progress.set(0)

            if d2.get("authenticated") and d2.get("quota"):
                q2 = d2["quota"]
                self.lbl_d2_info.configure(text=f"{q2['formatted_usage']} / {q2['formatted_limit']} (Livre: {q2['formatted_free']})")
                self.d2_progress.set(q2["percent_used"] / 100.0)
            else:
                self.lbl_d2_info.configure(text="Não autenticado (requer token_drive2.json)")
                self.d2_progress.set(0)

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
        """Abre janela para autorização das contas."""
        diag = ctk.CTkToplevel(self.root) if USE_CTK else ctk.Toplevel(self.root)
        diag.title("Autenticação OAuth 2.0 - Contas Google Drive")
        diag.geometry("520x360")
        diag.grab_set()

        lbl = ctk.CTkLabel(
            diag,
            text="Configurar Acesso às Contas Google Drive",
            font=ctk.CTkFont(size=16, weight="bold")
        ) if USE_CTK else ctk.Label(diag, text="Configurar Contas", font=("Arial", 14, "bold"))
        lbl.pack(padx=16, pady=16)

        msg = (
            "Para conectar as contas, certifique-se de que o arquivo 'credentials.json'\n"
            "está presente na pasta do projeto.\n\n"
            "Ao clicar em 'Conectar', seu navegador será aberto para efetuar o login com o Google."
        )
        ctk.CTkLabel(diag, text=msg, justify="left").pack(padx=20, pady=8) if USE_CTK else ctk.Label(diag, text=msg).pack(pady=8)

        # Status do arquivo credentials.json
        has_creds = os.path.exists("credentials.json")
        creds_status_txt = "✔ credentials.json encontrado" if has_creds else "⚠ credentials.json não encontrado na raiz"
        creds_color = "#10b981" if has_creds else "#f59e0b"
        lbl_creds_stat = ctk.CTkLabel(diag, text=creds_status_txt, text_color=creds_color, font=ctk.CTkFont(size=11, weight="bold")) if USE_CTK else ctk.Label(diag, text=creds_status_txt, fg=creds_color)
        lbl_creds_stat.pack(pady=4)

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
            diag, text="📁 Localizar credentials.json no computador", command=pick_credentials, fg_color="#334155", hover_color="#475569"
        ) if USE_CTK else ctk.Button(diag, text="Localizar credentials.json", command=pick_credentials)
        btn_pick.pack(pady=6)

        btn_f = ctk.CTkFrame(diag, fg_color="transparent") if USE_CTK else ctk.Frame(diag)
        btn_f.pack(pady=12)

        def auth_acc(acc_id):
            threading.Thread(target=lambda: self._do_auth(acc_id, diag), daemon=True).start()

        btn1 = ctk.CTkButton(
            btn_f, text="🔑 Conectar Drive 1", command=lambda: auth_acc("drive_1"), fg_color="#0284c7"
        ) if USE_CTK else ctk.Button(btn_f, text="Conectar Drive 1", command=lambda: auth_acc("drive_1"))
        btn1.pack(side="left", padx=8)

        btn2 = ctk.CTkButton(
            btn_f, text="🔑 Conectar Drive 2", command=lambda: auth_acc("drive_2"), fg_color="#eab308"
        ) if USE_CTK else ctk.Button(btn_f, text="Conectar Drive 2", command=lambda: auth_acc("drive_2"))
        btn2.pack(side="left", padx=8)

    def _do_auth(self, acc_id: str, dialog_window: Any):
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
            dialog_window.destroy()
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
