import subprocess
import json
import os

class StaticAnalyzer:
    @staticmethod
    def run_pylint(file_path: str):
        try:
            result = subprocess.run(
                ['pylint', '--output-format=json', file_path],
                capture_output=True, text=True
            )
            return json.loads(result.stdout)
        except Exception as e:
            return {"error": str(e)}

    @staticmethod
    def run_bandit(file_path: str):
        try:
            result = subprocess.run(
                ['bandit', '-f', 'json', file_path],
                capture_output=True, text=True
            )
            return json.loads(result.stdout)
        except Exception as e:
            return {"error": str(e)}

    @staticmethod
    def run_all(file_path: str):
        return {
            "pylint": StaticAnalyzer.run_pylint(file_path),
            "bandit": StaticAnalyzer.run_bandit(file_path)
        }
