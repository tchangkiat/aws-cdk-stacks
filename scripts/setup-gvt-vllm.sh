#!/bin/bash

export CCACHE_DIR=/root/.cache/ccache
export CMAKE_CXX_COMPILER_LAUNCHER=ccache

export VLLM_TARGET_DEVICE=cpu
export VLLM_CPU_KVCACHE_SPACE=40
export VLLM_CPU_OMP_THREADS_BIND=0-30
export VLLM_CPU_DISABLE_AVX512="true"
sudo echo 'export CCACHE_DIR=/root/.cache/ccache' | tee -a /home/ubuntu/.bashrc /home/ubuntu/.zshrc
sudo echo 'export CMAKE_CXX_COMPILER_LAUNCHER=ccache' | tee -a /home/ubuntu/.bashrc /home/ubuntu/.zshrc
sudo echo 'export VLLM_TARGET_DEVICE=cpu' | tee -a /home/ubuntu/.bashrc /home/ubuntu/.zshrc
sudo echo 'export VLLM_CPU_KVCACHE_SPACE=40' | tee -a /home/ubuntu/.bashrc /home/ubuntu/.zshrc
sudo echo 'export VLLM_CPU_OMP_THREADS_BIND=0-30' | tee -a /home/ubuntu/.bashrc /home/ubuntu/.zshrc
sudo echo 'export VLLM_CPU_DISABLE_AVX512="true"' | tee -a /home/ubuntu/.bashrc /home/ubuntu/.zshrc

sudo echo 'ulimit -c 0' | tee -a /home/ubuntu/.bashrc /home/ubuntu/.zshrc

curl -LsSf https://astral.sh/uv/install.sh | sh
source $HOME/.local/bin/env
# Create a new Python environment
uv venv --python 3.12 --seed
source .venv/bin/activate
# Build wheel from source
sudo apt-get update -y
sudo apt-get install -y --no-install-recommends ccache git curl wget ca-certificates gcc-12 g++-12 libtcmalloc-minimal4 libnuma-dev ffmpeg libsm6 libxext6 libgl1 jq lsof
sudo update-alternatives --install /usr/bin/gcc gcc /usr/bin/gcc-12 10 --slave /usr/bin/g++ g++ /usr/bin/g++-12
export LD_PRELOAD="/usr/lib/aarch64-linux-gnu/libtcmalloc_minimal.so.4"
sudo echo 'export LD_PRELOAD="/usr/lib/aarch64-linux-gnu/libtcmalloc_minimal.so.4"' | tee -a /home/ubuntu/.bashrc /home/ubuntu/.zshrc
# Clone vLLM project
git clone https://github.com/vllm-project/vllm.git vllm_source
cd vllm_source
# Install Python packages for vLLM CPU backend building
sudo apt-get install python3-pip -y
pip install -v -r requirements/cpu-build.txt --extra-index-url https://download.pytorch.org/whl/cpu
pip install -v -r requirements/cpu.txt --extra-index-url https://download.pytorch.org/whl/cpu
# Install vLLM
# python3 setup.py install
python3 setup.py bdist_wheel
pip install dist/*.whl
rm -rf dist
