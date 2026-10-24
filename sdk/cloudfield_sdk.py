#!/usr/bin/env python3
"""cloudfield_sdk.py — CloudField Python SDK（#10）

轻量封装：把批量诊断请求交给 Node CLI 执行，返回结构化结果。
依赖：本机已安装 Node，且 CloudField 仓库根目录在 CLOUDFIELD_ROOT 下。

典型用法：
    from cloudfield_sdk import CloudFieldSDK
    sdk = CloudFieldSDK(root="/path/to/CloudField")
    rows = sdk.batch(
        stations=[{"name":"ZSSS","patch":{"env":{"surfaceTemp":15,"surfaceRH":80}}}],
        times=[0, 6, 12, 18],
    )
    for r in rows:
        print(r["station"], r["t"], r["vis"], r["cover"])
"""
from __future__ import annotations
import json
import os
import subprocess
from typing import Any, Dict, List, Optional

DEFAULT_ROOT_GUESSES = [
    os.path.join(os.path.dirname(__file__), ".."),
    os.getcwd(),
]


class CloudFieldSDK:
    def __init__(self, root: Optional[str] = None, node: str = "node"):
        self.root = root or self._guess_root()
        self.node = node
        self.cli = os.path.join(self.root, "tools", "cli.js")
        if not os.path.exists(self.cli):
            raise FileNotFoundError("未找到 CloudField CLI: " + self.cli)

    @staticmethod
    def _guess_root() -> str:
        for g in DEFAULT_ROOT_GUESSES:
            if os.path.exists(os.path.join(g, "tools", "cli.js")):
                return os.path.abspath(g)
        return os.getcwd()

    def batch(self, stations: List[Dict[str, Any]], times: List[float],
              fmt: str = "json") -> List[Dict[str, Any]]:
        """批量诊断：机场列表 × 时次。返回结果行列表。"""
        stations_file = self._write_temp(json.dumps(stations, ensure_ascii=False))
        cmd = [self.node, self.cli, "--stations", stations_file,
               "--times", ",".join(str(t) for t in times), "--format", fmt]
        out = subprocess.check_output(cmd, text=True)
        return json.loads(out)["rows"]

    def run_steps(self, stations: List[Dict[str, Any]], steps_file: str,
                 fmt: str = "json") -> List[Dict[str, Any]]:
        """按时序文件（时序 CSV）批量诊断。"""
        stations_file = self._write_temp(json.dumps(stations, ensure_ascii=False))
        cmd = [self.node, self.cli, "--stations", stations_file,
               "--steps", steps_file, "--format", fmt]
        out = subprocess.check_output(cmd, text=True)
        return json.loads(out)["rows"]

    @staticmethod
    def _write_temp(text: str) -> str:
        import tempfile
        fd, path = tempfile.mkstemp(suffix=".json", prefix="cf_stations_")
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            f.write(text)
        return path
