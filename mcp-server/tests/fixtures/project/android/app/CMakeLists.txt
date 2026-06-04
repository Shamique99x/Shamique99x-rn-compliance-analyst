cmake_minimum_required(VERSION 3.22.1)
project(MyApp)
add_library(myapp SHARED src/main.cpp)
target_link_libraries(myapp log android)
