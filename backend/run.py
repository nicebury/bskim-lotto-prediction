"""개발용 실행 진입점. 운영에서는 uvicorn 을 직접 띄운다.

    uv run uvicorn app.main:app --port 8005 --reload
"""
import uvicorn

from app.config import settings

if __name__ == "__main__":
    # 0.0.0.0 은 컨테이너 안에서 필요하다. 워커(127.0.0.1 고정)와 달리 백엔드는
    # 공개 API 이므로 외부 바인딩이 정상이다.
    uvicorn.run("app.main:app", host="0.0.0.0", port=settings.BACKEND_PORT, reload=True)
