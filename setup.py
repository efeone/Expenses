from setuptools import setup, find_packages

with open("requirements.txt") as f:
	install_requires = f.read().strip().split("\n")

# get version from __version__ variable in expenses/__init__.py
from expenses import __version__ as version

setup(
	name="expenses",
	version=version,
	description="For expense entry in ERPNext",
	author="efeone Pvt Ltd",
	author_email="info@efeone.com",
	packages=find_packages(),
	zip_safe=False,
	include_package_data=True,
	install_requires=install_requires
)
